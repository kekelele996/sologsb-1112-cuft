import { planMerge, ringFingerprint } from '../src/utils/merge-core';
import type { RingRecord } from '../src/types/ring-record';
import type { BirdSite } from '../src/types/bird-site';
import type { SurveySession } from '../src/types/session';
import type { Morphometrics } from '../src/types/morphometrics';
import type { ExtractPackage } from '../src/types/source';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log('  ✓', msg);
  } else {
    failed += 1;
    console.error('  ✗ FAIL:', msg);
  }
}

function ring(partial: Partial<RingRecord>): RingRecord {
  return {
    id: partial.id ?? 'ring-x',
    ringNo: partial.ringNo ?? 'A-1',
    colorRing: partial.colorRing ?? '无',
    speciesCn: partial.speciesCn ?? '红喉歌鸲',
    speciesSci: partial.speciesSci ?? 'Calliope calliope',
    age: partial.age ?? '成',
    ringDate: partial.ringDate ?? '2024-01-01T00:00:00.000Z',
    netNo: partial.netNo ?? '1 号网',
    netRound: partial.netRound ?? 1,
    status: partial.status ?? '初捕',
    ringer: partial.ringer ?? '韩雪',
    siteId: partial.siteId ?? 'site-1',
    sessionId: partial.sessionId ?? 'sess-1',
    remark: partial.remark,
    source: partial.source ?? 'station',
    origin: partial.origin ?? '站里',
    conflictGroup: partial.conflictGroup ?? '',
    superseded: partial.superseded ?? false,
  };
}
function site(partial: Partial<BirdSite>): BirdSite {
  return {
    id: partial.id ?? 'site-1',
    siteNo: partial.siteNo ?? 'S-01',
    name: partial.name ?? '站里点',
    lng: partial.lng ?? 118,
    lat: partial.lat ?? 38.9,
    habitat: partial.habitat ?? '芦苇湿地',
    netCount: partial.netCount ?? 5,
    source: partial.source ?? 'station',
    origin: partial.origin ?? '站里',
    status: partial.status ?? 'confirmed',
  };
}
function session(partial: Partial<SurveySession>): SurveySession {
  return {
    id: partial.id ?? 'sess-1',
    sessionNo: partial.sessionNo ?? 'B-01',
    date: partial.date ?? '2024-01-01',
    siteId: partial.siteId ?? 'site-1',
    startedAt: partial.startedAt ?? '05:00',
    endedAt: partial.endedAt ?? '11:00',
    netRounds: partial.netRounds ?? 6,
    cloudCover: partial.cloudCover ?? 2,
    windForce: partial.windForce ?? 2,
    closed: partial.closed ?? true,
    leader: partial.leader ?? '韩雪',
    source: partial.source ?? 'station',
    origin: partial.origin ?? '站里',
  };
}

const pkg: ExtractPackage = {
  app: 'gbbirdring-extract',
  packageId: 'pkg-test-1',
  origin: '野外一组',
  exportedAt: '2024-02-02T00:00:00.000Z',
  rings: [],
  morphs: [],
  sites: [],
  sessions: [],
};

// 场景 1：同一条记录两边都改过 → 留两版、默认站里采用
{
  const station = ring({ id: 'r1', ringNo: 'A-1', ringer: '韩雪', weight: undefined as never, remark: '站里备注' });
  const incoming = { ...station, ringer: '郑海', remark: '野外改了备注' };
  const plan = planMerge(
    { rings: [station], morphs: [], sites: [site({})], sessions: [session({})] },
    { ...pkg, packageId: 'p1', rings: [incoming] },
    '2024-03-01T00:00:00.000Z',
  );
  assert(plan.conflicts.length === 1, '同记录两边都改 → 产生 1 组冲突');
  assert(plan.ringsToAdd.length === 0, '冲突不进新增');
  assert(plan.fieldRingsToAdd.length === 1, '写入 1 条野外留版');
  assert(plan.fieldRingsToAdd[0].superseded === true, '野外版默认留档（superseded）');
  assert(plan.fieldRingsToAdd[0].source === 'field' && plan.fieldRingsToAdd[0].origin === '野外一组', '野外版标来源');
  assert(plan.stationRingsToUpdate[0]?.superseded === false, '站里版默认采用');
  assert(plan.stationRingsToUpdate[0]?.conflictGroup === plan.fieldRingsToAdd[0].conflictGroup && !!plan.fieldRingsToAdd[0].conflictGroup, '两版归入同一冲突组');
}

// 场景 2：内容一致 → 跳过（幂等，不重复记）
{
  const station = ring({ id: 'r2', ringNo: 'A-2' });
  const plan = planMerge(
    { rings: [station], morphs: [], sites: [], sessions: [] },
    { ...pkg, packageId: 'p2', rings: [{ ...station }] },
    'now',
  );
  assert(plan.skippedRings === 1, '内容一致 → 跳过 1 条');
  assert(plan.ringsToAdd.length === 0 && plan.fieldRingsToAdd.length === 0, '不新增、不留版');
}

// 场景 3：新鸟 → 直接收编为正式版
{
  const plan = planMerge(
    { rings: [], morphs: [], sites: [], sessions: [] },
    { ...pkg, packageId: 'p3', rings: [ring({ id: 'r3', ringNo: 'B-9' })] },
    'now',
  );
  assert(plan.ringsToAdd.length === 1, '新鸟 → 新增 1 条');
  assert(plan.ringsToAdd[0].superseded === false && plan.ringsToAdd[0].source === 'field', '新鸟为正式采用版、来源野外');
}

// 场景 4：陌生鸟点 → 待确认，不进正式统计
{
  const newSite = site({ id: 'field-site', siteNo: 'S-99', name: '野外地块', status: 'confirmed' });
  const plan = planMerge(
    { rings: [], morphs: [], sites: [site({})], sessions: [] },
    { ...pkg, packageId: 'p4', sites: [newSite] },
    'now',
  );
  assert(plan.sitesToPut.length === 1, '陌生鸟点新增 1 个');
  assert(plan.sitesToPut[0].status === 'pending', '陌生鸟点强制挂「待确认」');
  assert(plan.pendingSiteCount === 1, '待确认计数 = 1');
}

// 场景 5：同环号的重捕是不同事件，不应误判成冲突
{
  const first = ring({ id: 'r5a', ringNo: 'A-5', status: '初捕', ringDate: '2024-01-01T00:00:00.000Z', netRound: 1 });
  const recapture = ring({ id: 'r5b', ringNo: 'A-5', status: '重捕', ringDate: '2024-02-01T00:00:00.000Z', netRound: 3 });
  const plan = planMerge(
    { rings: [first], morphs: [], sites: [site({})], sessions: [] },
    { ...pkg, packageId: 'p5', rings: [recapture] },
    'now',
  );
  assert(plan.conflicts.length === 0, '同环号不同事件（重捕）→ 不冲突');
  assert(plan.ringsToAdd.length === 1, '重捕作为新事件收编');
}

// 场景 6：重试幂等 —— 同一包在已合并后的台账上再算一遍，不产生重复
{
  const now = 'now';
  const firstPlan = planMerge(
    { rings: [], morphs: [], sites: [], sessions: [] },
    { ...pkg, packageId: 'p6', rings: [ring({ id: 'r6', ringNo: 'C-6' })], sites: [site({ id: 's6', siteNo: 'S-06' })] },
    now,
  );
  // 模拟第一次合并后的台账：新鸟 + 新点位已写入
  const ledger = {
    rings: firstPlan.ringsToAdd,
    morphs: [] as Morphometrics[],
    sites: firstPlan.sitesToPut,
    sessions: [] as SurveySession[],
  };
  const secondPlan = planMerge(
    ledger,
    { ...pkg, packageId: 'p6', rings: [ring({ id: 'r6', ringNo: 'C-6' })] , sites: [site({ id: 's6', siteNo: 'S-06' })] },
    now,
  );
  assert(secondPlan.ringsToAdd.length === 0, '重试：环志不再新增');
  assert(secondPlan.skippedRings === 1, '重试：环志按内容一致跳过');
  assert(secondPlan.sitesToPut.length === 0, '重试：点位按编号对齐不再新增');
}

// 场景 7：id 撞号但内容不同、且指纹不同 → 新鸟重新分配 id，不覆盖
{
  const station = ring({ id: 'same-id', ringNo: 'D-1', status: '初捕', ringDate: '2024-01-01T00:00:00.000Z' });
  const fieldOther = ring({ id: 'same-id', ringNo: 'D-2', status: '初捕', ringDate: '2024-03-01T00:00:00.000Z' });
  const plan = planMerge(
    { rings: [station], morphs: [], sites: [], sessions: [] },
    { ...pkg, packageId: 'p7', rings: [fieldOther] },
    'now',
  );
  // id 命中站里记录但内容不同 → keepBoth（因为先按 id 对齐）
  assert(plan.fieldRingsToAdd[0]?.id !== 'same-id', '撞号野外版重新分配 id，不覆盖站里记录');
}

// 指纹函数稳定性
assert(
  ringFingerprint(ring({ ringNo: 'a-1', ringDate: 'D', netNo: 'N', netRound: 2, status: '初捕' })) ===
    ringFingerprint(ring({ ringNo: 'A-1 ', ringDate: 'D', netNo: ' N', netRound: 2, status: '初捕' })),
  '事件指纹对环号大小写/空格不敏感',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
