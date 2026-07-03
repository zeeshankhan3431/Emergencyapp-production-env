/**
 * OpenSearch — analytics index queries (hotspots from crime-analytics-{YYYY-MM}).
 * Mock mode returns deterministic cluster data for tests / local dev.
 */
import https from 'node:https';

const DEFAULT_MOCK = [
  {
    cluster_id:    'c1',
    centroid_lat:  51.507,
    centroid_lng:  -0.128,
    point_count:   42,
    dominant_type: 'assault',
  },
  {
    cluster_id:    'c2',
    centroid_lat:  51.515,
    centroid_lng:  -0.100,
    point_count:   28,
    dominant_type: 'medical',
  },
];

/** @type {typeof DEFAULT_MOCK} */
let mockClusters = [...DEFAULT_MOCK];

export function useMock() {
  return process.env.OPENSEARCH_USE_MOCK === 'true';
}

/**
 * @returns {Promise<Array<{
 *   cluster_id: string,
 *   centroid_lat: number,
 *   centroid_lng: number,
 *   point_count: number,
 *   dominant_type: string
 * }>>}
 */
export async function queryHotspotClusters() {
  if (useMock()) {
    return mockClusters.map((c) => ({ ...c }));
  }

  const host = process.env.OPENSEARCH_ENDPOINT;
  if (!host) {
    console.warn('[opensearch] OPENSEARCH_ENDPOINT unset — returning empty clusters');
    return [];
  }

  const indexPrefix = process.env.OPENSEARCH_ANALYTICS_INDEX_PREFIX ?? 'crime-analytics';
  const now = new Date();
  const index = `${indexPrefix}-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const body = JSON.stringify({
    size: 10,
    query: { match_all: {} },
  });

  const url = `https://${host}/${index}/_search`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const hits = parsed.hits?.hits ?? [];
            const out = hits.map((h) => ({
              cluster_id:    h._id ?? h._source?.cluster_id,
              centroid_lat:  h._source?.centroid_lat ?? h._source?.spatial_hotspots?.[0]?.centroid_lat,
              centroid_lng:  h._source?.centroid_lng ?? h._source?.spatial_hotspots?.[0]?.centroid_lng,
              point_count:   h._source?.point_count ?? 0,
              dominant_type: h._source?.dominant_type ?? 'other',
            }));
            resolve(out.filter((x) => x.centroid_lat != null));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** @param {typeof DEFAULT_MOCK} clusters */
export function __setOpenSearchMockClusters(clusters) {
  mockClusters = clusters.length ? clusters.map((c) => ({ ...c })) : [...DEFAULT_MOCK];
}

export function __resetOpenSearchMock() {
  mockClusters = DEFAULT_MOCK.map((c) => ({ ...c }));
}
