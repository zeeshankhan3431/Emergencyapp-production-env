"""
EMR Spark Job: crime-pattern-analytics  (Track C)

Scheduled via EventBridge daily cron at 02:00 UTC.
Source: anonymised_incidents table (Module 5) read from RDS via JDBC.

Algorithms:
  A. HDBSCAN clustering on (lat, lng, hour_of_day)  → spatial hotspots
  B. STL time-series decomposition on daily counts   → trend detection
  C. Incident type distribution per area             → resource allocation

Output: OpenSearch index  crime-analytics-{YYYY-MM}
"""

import json
import os
import sys
from datetime import datetime, timezone

from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    DoubleType, IntegerType, StringType, StructField, StructType,
)

# ── Conditional imports (EMR cluster has these; dev fallback below) ────────────
try:
    import hdbscan                      # pip install hdbscan
    import numpy as np
    from statsmodels.tsa.seasonal import STL   # pip install statsmodels
    import pandas as pd
    FULL_DEPS = True
except ImportError:
    FULL_DEPS = False
    print("[analytics] WARNING: hdbscan/statsmodels not available — using stub algorithms")

try:
    from opensearchpy import OpenSearch, RequestsHttpConnection  # pip install opensearch-py
    OS_AVAILABLE = True
except ImportError:
    OS_AVAILABLE = False
    print("[analytics] WARNING: opensearch-py not available — OpenSearch write skipped")

# ─────────────────────────────────────────────────────────────────────────────

def get_spark() -> SparkSession:
    return (
        SparkSession.builder
        .appName("crime-pattern-analytics")
        .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
        .getOrCreate()
    )


def read_anonymised_incidents(spark: SparkSession):
    """
    Read anonymised_incidents from PostgreSQL via JDBC.
    Uses RDS endpoint and credentials injected as EMR step arguments.
    Only selects non-PII columns (lat, lng, hour_of_day, type, date, area_code).
    """
    jdbc_url = os.environ.get(
        "RDS_JDBC_URL",
        f"jdbc:postgresql://{os.environ.get('RDS_HOST', 'localhost')}:5432"
        f"/{os.environ.get('RDS_DB', 'emergencydb')}",
    )
    props = {
        "user":     os.environ.get("RDS_USER", "analytics_ro"),
        "password": os.environ.get("RDS_PASSWORD", ""),
        "driver":   "org.postgresql.Driver",
    }
    return spark.read.jdbc(
        url=jdbc_url,
        table=(
            """(
              SELECT
                lat, lng,
                EXTRACT(HOUR FROM triggered_at)::INT        AS hour_of_day,
                DATE_TRUNC('day', triggered_at)::DATE::TEXT AS incident_date,
                type,
                area_code
              FROM anonymised_incidents
              WHERE triggered_at >= NOW() - INTERVAL '90 days'
                AND k_anon_group_size >= 5
            ) AS t"""
        ),
        properties=props,
    )


# ── Algorithm A: HDBSCAN Spatial Hotspots ────────────────────────────────────

def compute_spatial_hotspots(df):
    """
    Runs HDBSCAN on (lat, lng, hour_of_day) to detect spatial crime clusters.
    Returns a list of cluster dicts: { cluster_id, centroid_lat, centroid_lng,
                                       peak_hour, point_count }
    Falls back to a deterministic grid-cell aggregation if HDBSCAN unavailable.
    """
    if not FULL_DEPS:
        return _grid_cell_hotspots(df)

    pdf = df.select("lat", "lng", "hour_of_day").toPandas()
    coords = pdf[["lat", "lng", "hour_of_day"]].values

    clusterer = hdbscan.HDBSCAN(min_cluster_size=5, min_samples=3)
    labels    = clusterer.fit_predict(coords)
    pdf["cluster"] = labels

    clusters = []
    for cid in set(labels):
        if cid == -1:
            continue   # noise
        grp = pdf[pdf["cluster"] == cid]
        clusters.append({
            "cluster_id":   int(cid),
            "centroid_lat": float(grp["lat"].mean()),
            "centroid_lng": float(grp["lng"].mean()),
            "peak_hour":    int(grp["hour_of_day"].mode()[0]),
            "point_count":  int(len(grp)),
        })
    return clusters


def _grid_cell_hotspots(df):
    """Deterministic fallback: 0.01° grid cells, count ≥ 5."""
    result = (
        df.withColumn("grid_lat", F.round(F.col("lat"), 2))
          .withColumn("grid_lng", F.round(F.col("lng"), 2))
          .groupBy("grid_lat", "grid_lng")
          .agg(
              F.count("*").alias("point_count"),
              F.avg("hour_of_day").alias("avg_hour"),
          )
          .filter(F.col("point_count") >= 5)
          .collect()
    )
    return [
        {
            "cluster_id":   i,
            "centroid_lat": float(r["grid_lat"]),
            "centroid_lng": float(r["grid_lng"]),
            "peak_hour":    int(round(r["avg_hour"])),
            "point_count":  int(r["point_count"]),
        }
        for i, r in enumerate(result)
    ]


# ── Algorithm B: STL Time-Series Trend Detection ─────────────────────────────

def compute_trend(df):
    """
    STL decomposition on daily incident counts.
    Returns { trend_direction: 'increasing'|'decreasing'|'stable',
              trend_slope: float, seasonal_strength: float }
    """
    if not FULL_DEPS:
        return {"trend_direction": "stable", "trend_slope": 0.0, "seasonal_strength": 0.0}

    daily = (
        df.groupBy("incident_date")
          .agg(F.count("*").alias("count"))
          .orderBy("incident_date")
          .toPandas()
    )

    if len(daily) < 14:
        return {"trend_direction": "insufficient_data", "trend_slope": 0.0, "seasonal_strength": 0.0}

    series = pd.Series(daily["count"].values, dtype=float)
    period = min(7, len(series) // 2)
    stl    = STL(series, period=period, robust=True)
    res    = stl.fit()

    trend = res.trend
    slope = float(np.polyfit(np.arange(len(trend)), trend, 1)[0])

    var_seasonal = float(np.var(res.seasonal))
    var_residual = float(np.var(res.resid))
    seasonal_strength = max(0.0, 1.0 - var_residual / (var_seasonal + var_residual + 1e-9))

    direction = "stable"
    if slope >  0.5: direction = "increasing"
    if slope < -0.5: direction = "decreasing"

    return {
        "trend_direction":    direction,
        "trend_slope":        round(slope, 4),
        "seasonal_strength":  round(seasonal_strength, 4),
    }


# ── Algorithm C: Incident Type Distribution per Area ─────────────────────────

def compute_type_distribution(df):
    """
    Returns list of { area_code, type, count, pct } for resource allocation.
    """
    total_by_area = (
        df.groupBy("area_code")
          .agg(F.count("*").alias("area_total"))
    )
    breakdown = (
        df.groupBy("area_code", "type")
          .agg(F.count("*").alias("count"))
          .join(total_by_area, on="area_code")
          .withColumn("pct", F.round(F.col("count") / F.col("area_total") * 100, 2))
          .select("area_code", "type", "count", "pct")
          .collect()
    )
    return [
        {
            "area_code": r["area_code"],
            "type":      r["type"],
            "count":     int(r["count"]),
            "pct":       float(r["pct"]),
        }
        for r in breakdown
    ]


# ── OpenSearch writer ─────────────────────────────────────────────────────────

def write_to_opensearch(index_name: str, document: dict):
    """
    Upserts the analytics document to OpenSearch.
    Uses the analysis month as the document ID for idempotent daily runs.
    """
    if not OS_AVAILABLE:
        print(f"[analytics] (dry-run) Would write to OpenSearch index={index_name}")
        print(json.dumps(document, indent=2, default=str))
        return

    host     = os.environ.get("OPENSEARCH_ENDPOINT", "localhost")
    port     = int(os.environ.get("OPENSEARCH_PORT", "443"))
    use_ssl  = os.environ.get("OPENSEARCH_USE_SSL", "true") == "true"
    auth     = (
        os.environ.get("OPENSEARCH_USER", ""),
        os.environ.get("OPENSEARCH_PASSWORD", ""),
    )

    os_client = OpenSearch(
        hosts=[{"host": host, "port": port}],
        http_auth=auth,
        use_ssl=use_ssl,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30,
    )

    doc_id = document.get("analysis_month", "unknown")
    os_client.index(index=index_name, id=doc_id, body=document, refresh="wait_for")
    print(f"[analytics] Indexed document '{doc_id}' into OpenSearch index '{index_name}'")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    spark = get_spark()
    now   = datetime.now(timezone.utc)
    month = now.strftime("%Y-%m")

    print(f"[analytics] Starting crime-pattern-analytics for {month}")

    df = read_anonymised_incidents(spark)
    df.cache()

    total_incidents = df.count()
    print(f"[analytics] Loaded {total_incidents} anonymised incidents")

    hotspots     = compute_spatial_hotspots(df)
    trend        = compute_trend(df)
    type_dist    = compute_type_distribution(df)

    document = {
        "analysis_month":      month,
        "run_timestamp":       now.isoformat(),
        "total_incidents":     total_incidents,
        "spatial_hotspots":    hotspots,
        "trend":               trend,
        "type_distribution":   type_dist,
    }

    index_name = f"crime-analytics-{month}"
    write_to_opensearch(index_name, document)

    print(f"[analytics] Done — {len(hotspots)} hotspots, trend={trend['trend_direction']}")
    spark.stop()


if __name__ == "__main__":
    main()
