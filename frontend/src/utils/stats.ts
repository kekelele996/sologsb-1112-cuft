import type { MeasureDeviation, MeasureKey, Morphometrics } from '../types/morphometrics';
import { MEASURE_FIELDS } from '../types/morphometrics';
import type { RingRecord, RingStatus } from '../types/ring-record';
import type { SessionStats, SurveySession } from '../types/session';

/** 常见环志鸟种目录（中文名 + 学名），供 SpeciesPicker 联想与自定义补充 */
export const SPECIES_CATALOG: Array<{ cn: string; sci: string }> = [
  { cn: '红喉歌鸲', sci: 'Calliope calliope' },
  { cn: '红胁蓝尾鸲', sci: 'Tarsiger cyanurus' },
  { cn: '北红尾鸲', sci: 'Phoenicurus auroreus' },
  { cn: '黄眉柳莺', sci: 'Phylloscopus inornatus' },
  { cn: '大山雀', sci: 'Parus cinereus' },
  { cn: '沼泽山雀', sci: 'Poecile palustris' },
  { cn: '震旦鸦雀', sci: 'Paradoxornis heudei' },
  { cn: '白眉鹀', sci: 'Emberiza tristrami' },
  { cn: '苇鹀', sci: 'Emberiza pallasi' },
  { cn: '灰喜鹊', sci: 'Cyanopica cyanus' },
  { cn: '黑腹滨鹬', sci: 'Calidris alpina' },
  { cn: '白腰杓鹬', sci: 'Numenius arquata' },
  { cn: '东方白鹳', sci: 'Ciconia boyciana' },
  { cn: '黄鹡鸰', sci: 'Motacilla tschutschensis' },
];

/** 各鸟种量度常见区间（mm / g），用于超出区间提示 */
export const SPECIES_MEASURE_RANGES: Record<string, Partial<Record<MeasureKey, [number, number]>>> = {
  红喉歌鸲: { billLength: [12, 16], wingLength: [68, 80], tailLength: [52, 66], tarsusLength: [21, 26], weight: [18, 28] },
  红胁蓝尾鸲: { billLength: [10, 14], wingLength: [68, 80], tailLength: [48, 60], tarsusLength: [19, 24], weight: [11, 19] },
  北红尾鸲: { billLength: [11, 15], wingLength: [72, 84], tailLength: [58, 70], tarsusLength: [20, 25], weight: [13, 21] },
  黄眉柳莺: { billLength: [8, 12], wingLength: [52, 64], tailLength: [34, 44], tarsusLength: [15, 19], weight: [5, 10] },
  大山雀: { billLength: [8, 12], wingLength: [66, 78], tailLength: [52, 64], tarsusLength: [17, 22], weight: [11, 19] },
  沼泽山雀: { billLength: [7, 11], wingLength: [58, 68], tailLength: [48, 60], tarsusLength: [15, 20], weight: [8, 14] },
  震旦鸦雀: { billLength: [8, 12], wingLength: [52, 64], tailLength: [72, 92], tarsusLength: [19, 25], weight: [13, 22] },
  白眉鹀: { billLength: [9, 13], wingLength: [70, 82], tailLength: [60, 72], tarsusLength: [17, 22], weight: [17, 27] },
  苇鹀: { billLength: [7, 11], wingLength: [60, 72], tailLength: [52, 64], tarsusLength: [16, 20], weight: [11, 19] },
  灰喜鹊: { billLength: [23, 32], wingLength: [126, 148], tailLength: [195, 235], tarsusLength: [28, 36], weight: [65, 100] },
  黑腹滨鹬: { billLength: [26, 38], wingLength: [100, 124], tailLength: [42, 58], tarsusLength: [24, 32], weight: [38, 75] },
  白腰杓鹬: { billLength: [105, 155], wingLength: [255, 305], tailLength: [95, 125], tarsusLength: [68, 88], weight: [560, 1050] },
  东方白鹳: { billLength: [195, 270], wingLength: [540, 620], tailLength: [200, 260], tarsusLength: [200, 260], weight: [2800, 4600] },
  黄鹡鸰: { billLength: [11, 16], wingLength: [72, 86], tailLength: [62, 78], tarsusLength: [20, 25], weight: [14, 24] },
};

export function speciesOf(ring: RingRecord): { cn: string; sci: string } {
  return { cn: ring.speciesCn, sci: ring.speciesSci };
}

/** 鸟种计数（按记录数降序） */
export function speciesCount(records: RingRecord[]): Array<{ speciesCn: string; speciesSci: string; count: number }> {
  const map = new Map<string, { speciesCn: string; speciesSci: string; count: number }>();
  records.forEach((record) => {
    const item = map.get(record.speciesCn) ?? { speciesCn: record.speciesCn, speciesSci: record.speciesSci, count: 0 };
    item.count += 1;
    map.set(record.speciesCn, item);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

/** 状态分布 */
export function statusBreakdown(records: RingRecord[]): Record<RingStatus, number> {
  const result: Record<RingStatus, number> = { 初捕: 0, 重捕: 0, 回收: 0 };
  records.forEach((record) => {
    result[record.status] += 1;
  });
  return result;
}

/** 重捕率（%）：重捕 / (初捕 + 重捕) */
export function recaptureRate(records: RingRecord[]): number {
  const created = records.filter((r) => r.status === '初捕').length;
  const recaptured = records.filter((r) => r.status === '重捕').length;
  const base = created + recaptured;
  return base > 0 ? Number(((recaptured / base) * 100).toFixed(1)) : 0;
}

/** 批次统计：鸟种数、初捕数与重捕数 */
export function buildSessionStats(session: SurveySession, records: RingRecord[], siteName: string): SessionStats {
  const scoped = records.filter((record) => record.sessionId === session.id);
  const breakdown = statusBreakdown(scoped);
  const base = breakdown.初捕 + breakdown.重捕;
  return {
    session,
    siteName,
    speciesCount: new Set(scoped.map((record) => record.speciesCn)).size,
    firstCount: breakdown.初捕,
    recaptureCount: breakdown.重捕,
    recoveryCount: breakdown.回收,
    recaptureRate: base > 0 ? Number(((breakdown.重捕 / base) * 100).toFixed(1)) : 0,
  };
}

/** 同鸟种历史均值（按量度字段） */
export function measureMeans(records: RingRecord[], morphs: Morphometrics[]): Record<string, Record<MeasureKey, number>> {
  const speciesByRing = new Map(records.map((record) => [record.id, record.speciesCn]));
  const buckets = new Map<string, Morphometrics[]>();
  morphs.forEach((morph) => {
    const species = speciesByRing.get(morph.ringId);
    if (!species) return;
    const list = buckets.get(species) ?? [];
    list.push(morph);
    buckets.set(species, list);
  });

  const result: Record<string, Record<MeasureKey, number>> = {};
  buckets.forEach((list, species) => {
    const means = {} as Record<MeasureKey, number>;
    MEASURE_FIELDS.forEach((field) => {
      const values = list.map((morph) => Number(morph[field.key]) || 0).filter((value) => value > 0);
      means[field.key] = values.length ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)) : 0;
    });
    result[species] = means;
  });
  return result;
}

/** 单条量度与同鸟种均值、常见区间的偏离计算 */
export function deviationsOf(
  values: Record<MeasureKey, number>,
  speciesCn: string,
  means?: Record<MeasureKey, number>,
): MeasureDeviation[] {
  const ranges = SPECIES_MEASURE_RANGES[speciesCn] ?? {};
  return MEASURE_FIELDS.map((field) => {
    const value = Number(values[field.key]) || 0;
    const mean = means?.[field.key] ?? 0;
    const deviationPct = mean > 0 ? Number((((value - mean) / mean) * 100).toFixed(1)) : 0;
    const range = ranges[field.key];
    let level: MeasureDeviation['level'] = '正常';
    let message = mean > 0 ? `与同鸟种均值 ${mean}${field.unit} 偏差 ${deviationPct}%` : '暂无同鸟种历史均值可比对';

    if (value < field.min || value > field.max) {
      level = '超出常见区间';
      message = `${field.label} ${value}${field.unit} 超出量度录入范围 ${field.min}~${field.max}${field.unit}`;
    } else if (range && (value < range[0] || value > range[1])) {
      level = '超出常见区间';
      message = `${field.label} ${value}${field.unit} 超出「${speciesCn}」常见区间 ${range[0]}~${range[1]}${field.unit}`;
    } else if (mean > 0 && Math.abs(deviationPct) > 15) {
      level = '偏离';
      message = `${field.label} 与同鸟种均值 ${mean}${field.unit} 偏差 ${deviationPct}%（超过 15%）`;
    }
    return { key: field.key, label: field.label, value, mean, deviationPct, level, message };
  });
}

/** 是否存在需要提示的偏离项 */
export function hasWarning(deviations: MeasureDeviation[]): boolean {
  return deviations.some((item) => item.level !== '正常');
}
