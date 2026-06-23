/**
 * Data router - 单测（任务 3.2）
 * 验证：GET /api/data/* 路由返回有效 JSON
 */
import request from 'supertest';
import express from 'express';
import { createDataRouter } from '../../routes/data';

function createApp() {
  const app = express();
  app.use(createDataRouter());
  return app;
}

describe('Data router', () => {
  const app = createApp();

  test('GET /api/data/classes returns array', async () => {
    const res = await request(app).get('/api/data/classes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/data/factions returns array', async () => {
    const res = await request(app).get('/api/data/factions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(5);
  });

  test('GET /api/data/locations returns array', async () => {
    const res = await request(app).get('/api/data/locations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(10);
  });

  test('GET /api/data/ancestries returns array', async () => {
    const res = await request(app).get('/api/data/ancestries');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
