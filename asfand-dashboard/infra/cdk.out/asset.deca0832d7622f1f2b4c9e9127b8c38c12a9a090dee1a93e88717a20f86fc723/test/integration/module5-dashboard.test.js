import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { initTestDatabase, teardownTestDatabase } from '../helpers/testDb.js';
import { signAccessToken } from '../../src/services/jwtService.js';
import { insertUser } from '../../src/services/userRepository.js';
import { createIncident, updateIncident } from '../../src/services/incidentRepository.js';
import { syncAnonymisedIncidents } from '../../src/services/anonymisationService.js';
import { insertCommunityReport } from '../../src/services/communityReportsRepository.js';
import { __setOpenSearchMockClusters } from '../../src/services/openSearchService.js';

const app = createApp();

async function makeToken(role, userId) {
  const { token } = await signAccessToken({
    userId,
    email: `${role.toLowerCase()}@dash.test`,
    role,
    cognitoSub: null,
    fullName: `Test ${role}`,
  });
  return token;
}

describe('Module 5 — dashboard & analytics', () => {
  beforeEach(async () => {
    await initTestDatabase();
    __setOpenSearchMockClusters([
      { cluster_id: 'x1', centroid_lat: 51.5, centroid_lng: -0.12, point_count: 10, dominant_type: 'assault' },
    ]);
  });
  afterEach(teardownTestDatabase);

  it('GET /api/dashboard/stats — Admin only', async () => {
    const admin = await insertUser({
      email: 'adm@m5.test',
      cognitoSub: 'sub-adm-m5',
      role: 'Admin',
      fullName: 'Admin M5',
      isVerified: true,
    });
    const tok = await makeToken('Admin', admin.id);

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${tok}`).expect(200);
    expect(res.body).toMatchObject({
      active_incidents: expect.any(Number),
      escalated_today: expect.any(Number),
      resolved_today: expect.any(Number),
      top_incident_types: expect.any(Array),
      hotspot_count: expect.any(Number),
    });
  });

  it('GET /api/dashboard/stats — Analyst forbidden', async () => {
    const u = await insertUser({
      email: 'an@m5.test',
      cognitoSub: 'sub-an-m5',
      role: 'Analyst',
      fullName: 'Analyst M5',
      isVerified: true,
    });
    const tok = await makeToken('Analyst', u.id);
    await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${tok}`).expect(403);
  });

  it('GET /api/analytics/hotspots returns OpenSearch clusters (mock)', async () => {
    const u = await insertUser({
      email: 'an2@m5.test',
      cognitoSub: 'sub-an2',
      role: 'Analyst',
      fullName: 'Analyst2',
      isVerified: true,
    });
    const tok = await makeToken('Analyst', u.id);
    const res = await request(app).get('/api/analytics/hotspots').set('Authorization', `Bearer ${tok}`).expect(200);
    expect(res.body.clusters).toHaveLength(1);
    expect(res.body.clusters[0].cluster_id).toBe('x1');
  });

  it('k-anonymity sync publishes 5+ incidents in same equivalence class', async () => {
    const admin = await insertUser({
      email: 'adm2@m5.test',
      cognitoSub: 'sub-adm2',
      role: 'Admin',
      fullName: 'Admin2',
      isVerified: true,
    });
    const users = [];
    for (let i = 0; i < 5; i++) {
      users.push(
        await insertUser({
          email: `u${i}@m5.test`,
          cognitoSub: `sub-u${i}`,
          role: 'Public',
          fullName: `U${i}`,
          isVerified: true,
        })
      );
    }
    const lat = 51.5073;
    const lng = -0.1277;
    for (const u of users) {
      const inc = await createIncident({
        userId: u.id,
        type: 'assault',
        lat,
        lng,
      });
      await updateIncident(inc.id, { status: 'resolved', resolvedAt: new Date() });
    }
    const n = await syncAnonymisedIncidents();
    expect(n).toBeGreaterThanOrEqual(5);

    const tok = await makeToken('Analyst', admin.id);
    const map = await request(app).get('/api/dashboard/map').set('Authorization', `Bearer ${tok}`).expect(200);
    expect(map.body.points.length).toBeGreaterThanOrEqual(5);
    for (const p of map.body.points) {
      expect(p).not.toHaveProperty('user_id');
    }
  });

  it('GET /api/public/community-reports and safety-tips (no auth)', async () => {
    await insertCommunityReport({ title: 'Q1', summaryText: 'Summary text only.' });
    const r = await request(app).get('/api/public/community-reports').expect(200);
    expect(r.body.items.length).toBeGreaterThanOrEqual(1);
    expect(r.body.items[0].title).toBe('Q1');

    const t = await request(app).get('/api/public/safety-tips').expect(200);
    expect(t.body.tips.length).toBeGreaterThanOrEqual(1);
  });
});
