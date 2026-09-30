import { defineStore } from 'pinia';
import { db } from '../utils/db';
import { uid } from '../utils/id';
import { toPlain } from '../utils/plain';
import type { SurveySession } from '../types/session';

export interface SessionInput {
  sessionNo: string;
  date: string;
  siteId: string;
  startedAt: string;
  endedAt: string;
  netRounds: number;
  cloudCover: number;
  windForce: number;
  leader: string;
  remark?: string;
}

interface SessionState {
  sessions: SurveySession[];
  hydrated: boolean;
}

/** 调查批次与统计派生值 */
export const useSessionStore = defineStore('session', {
  state: (): SessionState => ({ sessions: [], hydrated: false }),

  getters: {
    byId(state) {
      return (id: string): SurveySession | undefined => state.sessions.find((session) => session.id === id);
    },
    sessionOptions(state): Array<{ label: string; value: string }> {
      return state.sessions.map((session) => ({
        label: `${session.sessionNo} · ${session.date} · ${session.closed ? '已关闭' : '进行中'}`,
        value: session.id,
      }));
    },
    openSessions(state): SurveySession[] {
      return state.sessions.filter((session) => !session.closed);
    },
  },

  actions: {
    async hydrate() {
      this.sessions = await db.sessions.orderBy('date').reverse().toArray();
      this.hydrated = true;
    },

    async addSession(input: SessionInput): Promise<SurveySession> {
      const session: SurveySession = {
        id: uid('session'),
        sessionNo: input.sessionNo.trim(),
        date: input.date,
        siteId: input.siteId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        netRounds: Number(input.netRounds) || 0,
        cloudCover: Number(input.cloudCover) || 0,
        windForce: Number(input.windForce) || 0,
        closed: false,
        leader: input.leader.trim(),
        remark: input.remark?.trim() || undefined,
      };
      await db.sessions.put(toPlain(session));
      this.sessions = [session, ...this.sessions];
      return session;
    },

    async updateSession(id: string, patch: Partial<SessionInput>) {
      const current = this.sessions.find((session) => session.id === id);
      if (!current) return;
      const next: SurveySession = { ...current, ...patch };
      await db.sessions.put(toPlain(next));
      this.sessions = this.sessions.map((session) => (session.id === id ? next : session));
    },

    /** 关闭批次后出统计 */
    async closeSession(id: string) {
      const current = this.sessions.find((session) => session.id === id);
      if (!current) return;
      const next: SurveySession = { ...current, closed: true, endedAt: current.endedAt || new Date().toTimeString().slice(0, 5) };
      await db.sessions.put(toPlain(next));
      this.sessions = this.sessions.map((session) => (session.id === id ? next : session));
    },

    async removeSession(id: string) {
      await db.sessions.delete(id);
      this.sessions = this.sessions.filter((session) => session.id !== id);
    },
  },
});
