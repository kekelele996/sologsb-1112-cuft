import { db } from './db';
import type { BirdSite } from '../types/bird-site';
import type { SurveySession } from '../types/session';
import type { RingRecord } from '../types/ring-record';
import type { Morphometrics } from '../types/morphometrics';
import { SPECIES_CATALOG } from './stats';

const DAY = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const dateDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const sciOf = (cn: string) => SPECIES_CATALOG.find((s) => s.cn === cn)?.sci ?? '';

export const SEED_SITES: BirdSite[] = [
  { id: 'site-001', siteNo: 'S-01', name: '大汶流芦苇荡', lng: 118.052, lat: 38.921, habitat: '芦苇湿地', netCount: 12, note: '主环志区，网阵沿堤布置' },
  { id: 'site-002', siteNo: 'S-02', name: '新滩涂面', lng: 118.224, lat: 38.782, habitat: '滩涂', netCount: 8, note: '涉禽停歇地，涨潮时网位需调整' },
  { id: 'site-003', siteNo: 'S-03', name: '孤岛林场', lng: 118.351, lat: 38.948, habitat: '次生林', netCount: 10, note: '林鸟为主' },
  { id: 'site-004', siteNo: 'S-04', name: '稻改田片', lng: 117.852, lat: 38.704, habitat: '农田', netCount: 6 },
  { id: 'site-005', siteNo: 'S-05', name: '湿地公园', lng: 118.118, lat: 39.052, habitat: '城市绿地', netCount: 5, note: '科普环志点' },
  { id: 'site-006', siteNo: 'S-06', name: '黄河口南岸', lng: 118.602, lat: 38.856, habitat: '芦苇湿地', netCount: 14, note: '巡护兼顾环志' },
];

export const SEED_SESSIONS: SurveySession[] = [
  { id: 'session-001', sessionNo: '2024-A01', date: dateDaysAgo(21), siteId: 'site-001', startedAt: '05:00', endedAt: '11:00', netRounds: 6, cloudCover: 2, windForce: 2, closed: true, leader: '韩雪' },
  { id: 'session-002', sessionNo: '2024-A02', date: dateDaysAgo(14), siteId: 'site-002', startedAt: '05:20', endedAt: '11:30', netRounds: 6, cloudCover: 5, windForce: 3, closed: true, leader: '韩雪' },
  { id: 'session-003', sessionNo: '2024-A03', date: dateDaysAgo(7), siteId: 'site-003', startedAt: '05:10', endedAt: '11:00', netRounds: 6, cloudCover: 1, windForce: 2, closed: true, leader: '郑海' },
  { id: 'session-004', sessionNo: '2024-A04', date: dateDaysAgo(2), siteId: 'site-001', startedAt: '05:30', endedAt: '11:00', netRounds: 6, cloudCover: 8, windForce: 4, closed: false, leader: '郑海', remark: '风力偏大，网次仅完成 4 次' },
];

function ring(
  index: number,
  ringNo: string,
  colorRing: string,
  speciesCn: string,
  age: RingRecord['age'],
  sessionId: string,
  siteId: string,
  netNo: string,
  netRound: number,
  status: RingRecord['status'],
  ringer: string,
  days: number,
  remark?: string,
): RingRecord {
  return {
    id: `ring-${String(index).padStart(3, '0')}`,
    ringNo,
    colorRing,
    speciesCn,
    speciesSci: sciOf(speciesCn),
    age,
    ringDate: isoDaysAgo(days),
    netNo,
    netRound,
    status,
    ringer,
    siteId,
    sessionId,
    remark,
  };
}

export const SEED_RINGS: RingRecord[] = [
  ring(1, 'A-10231', '红-黄', '红喉歌鸲', '成', 'session-001', 'site-001', '3 号网', 2, '初捕', '韩雪', 21),
  ring(2, 'A-10232', '无', '黄眉柳莺', '幼', 'session-001', 'site-001', '5 号网', 2, '初捕', '韩雪', 21),
  ring(3, 'A-10233', '蓝-白', '震旦鸦雀', '成', 'session-001', 'site-001', '7 号网', 3, '初捕', '韩雪', 21, '芦苇丛中捕获，本地留鸟'),
  ring(4, 'A-10234', '无', '苇鹀', '亚成', 'session-001', 'site-001', '2 号网', 4, '初捕', '郑海', 21),
  ring(5, 'A-10101', '绿-橙', '红喉歌鸲', '成', 'session-001', 'site-001', '3 号网', 5, '重捕', '韩雪', 21, '同季第二次重捕'),
  ring(6, 'A-10241', '无', '黑腹滨鹬', '成', 'session-002', 'site-002', '1 号网', 1, '初捕', '韩雪', 14),
  ring(7, 'A-10242', '黄-蓝-白', '白腰杓鹬', '成', 'session-002', 'site-002', '4 号网', 2, '初捕', '郑海', 14, '大型涉禽，量度后原地放飞'),
  ring(8, 'A-10243', '无', '黑腹滨鹬', '幼', 'session-002', 'site-002', '1 号网', 3, '初捕', '韩雪', 14),
  ring(9, 'B-20511', '无', '红胁蓝尾鸲', '亚成', 'session-003', 'site-003', '6 号网', 1, '初捕', '郑海', 7),
  ring(10, 'B-20512', '黑-红', '大山雀', '成', 'session-003', 'site-003', '8 号网', 2, '初捕', '郑海', 7),
  ring(11, 'B-20513', '无', '黄眉柳莺', '幼', 'session-003', 'site-003', '6 号网', 2, '初捕', '郑海', 7),
  ring(12, 'B-20514', '无', '沼泽山雀', '成', 'session-003', 'site-003', '9 号网', 3, '初捕', '韩雪', 7),
  ring(13, 'B-20515', '无', '灰喜鹊', '成', 'session-003', 'site-003', '10 号网', 4, '初捕', '韩雪', 7),
  ring(14, 'A-10231', '红-黄', '红喉歌鸲', '成', 'session-003', 'site-003', '6 号网', 5, '重捕', '郑海', 7, 'A-10231 跨点重捕，位移约 30km'),
  ring(15, 'C-30101', '无', '白眉鹀', '亚成', 'session-004', 'site-001', '4 号网', 1, '初捕', '郑海', 2),
  ring(16, 'C-30102', '无', '北红尾鸲', '成', 'session-004', 'site-001', '5 号网', 2, '初捕', '郑海', 2),
  ring(17, 'A-10099', '无', '红喉歌鸲', '成', 'session-004', 'site-001', '3 号网', 3, '回收', '郑海', 2, '回收自外站环志个体'),
  ring(18, 'C-30103', '无', '黄鹡鸰', '幼', 'session-004', 'site-001', '6 号网', 4, '初捕', '韩雪', 2),
];

function morph(
  index: number,
  ringId: string,
  billLength: number,
  billWidth: number,
  wingLength: number,
  tailLength: number,
  tarsusLength: number,
  weight: number,
  fatScore: number,
  measuredBy: string,
  days: number,
): Morphometrics {
  return {
    id: `morph-${String(index).padStart(3, '0')}`,
    ringId,
    billLength,
    billWidth,
    wingLength,
    tailLength,
    tarsusLength,
    weight,
    fatScore,
    measuredBy,
    measuredAt: isoDaysAgo(days),
  };
}

export const SEED_MORPHS: Morphometrics[] = [
  morph(1, 'ring-001', 14.2, 4.1, 74.5, 58.2, 23.4, 23.6, 2, '韩雪', 21),
  morph(2, 'ring-002', 9.6, 3.2, 58.4, 38.6, 16.8, 7.4, 1, '韩雪', 21),
  morph(3, 'ring-003', 10.1, 3.6, 58.2, 82.4, 22.1, 17.2, 3, '韩雪', 21),
  morph(4, 'ring-004', 9.2, 3.3, 65.8, 57.4, 17.6, 14.2, 2, '郑海', 21),
  morph(5, 'ring-005', 13.8, 4.0, 73.1, 57.0, 23.0, 22.8, 2, '韩雪', 21),
  morph(6, 'ring-006', 32.4, 4.8, 112.6, 50.2, 27.8, 55.4, 3, '韩雪', 14),
  morph(7, 'ring-007', 128.5, 9.4, 278.0, 110.2, 78.6, 820.0, 2, '郑海', 14),
  morph(8, 'ring-008', 30.1, 4.5, 105.8, 47.6, 26.4, 44.2, 1, '韩雪', 14),
  morph(9, 'ring-009', 12.1, 3.9, 72.6, 54.2, 21.4, 14.6, 2, '郑海', 7),
  morph(10, 'ring-010', 10.4, 3.5, 70.8, 58.6, 19.2, 15.1, 1, '郑海', 7),
  morph(11, 'ring-011', 9.4, 3.1, 57.2, 38.0, 16.4, 6.8, 1, '郑海', 7),
  morph(12, 'ring-012', 9.0, 3.2, 62.4, 53.6, 17.2, 10.4, 2, '韩雪', 7),
  morph(13, 'ring-015', 11.2, 3.8, 75.4, 65.2, 19.6, 21.4, 3, '郑海', 2),
  morph(14, 'ring-016', 12.6, 3.9, 78.2, 62.4, 22.0, 16.8, 2, '郑海', 2),
];

/** 首次打开（表内无数据）时写入示例数据；已有数据则不动 */
export async function seedIfEmpty(): Promise<void> {
  const flag = await db.meta.get('seeded');
  if (flag) {
    return;
  }
  const [ringCount, morphCount, siteCount, sessionCount] = await Promise.all([
    db.rings.count(),
    db.morphs.count(),
    db.sites.count(),
    db.sessions.count(),
  ]);

  await db.transaction('rw', db.rings, db.morphs, db.sites, db.sessions, db.meta, async () => {
    if (siteCount === 0) await db.sites.bulkPut(SEED_SITES);
    if (sessionCount === 0) await db.sessions.bulkPut(SEED_SESSIONS);
    if (ringCount === 0) await db.rings.bulkPut(SEED_RINGS);
    if (morphCount === 0) await db.morphs.bulkPut(SEED_MORPHS);
    await db.meta.put({ key: 'seeded', value: new Date().toISOString() });
  });
}
