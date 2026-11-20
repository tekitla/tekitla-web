import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MetricsClient } from '@/app/api';
import type { AgentSession, FlowMetrics } from '@/app/api';
import { browserTimeZone, metricsView, periodStart } from './metrics.logic';

/** Qué pide la página: proyecto, semanas y etiquetas (vacío = todas). */
export interface MetricsQuery {
  projectId: string;
  weeks: number;
  labelIds: readonly string[];
}

/**
 * Métricas de flujo de UN proyecto (issue 036, `GetFlowMetrics`). Provisto en
 * la ruta `metricas`. Protege contra respuestas viejas: si cambia el período
 * mientras una respuesta viene en camino, esa se ignora.
 */
@Injectable()
export class MetricsStore {
  private readonly client = inject(MetricsClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _metrics = signal<FlowMetrics | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  private readonly _query = signal<MetricsQuery | null>(null);

  readonly metrics = this._metrics.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly query = this._query.asReadonly();
  readonly view = computed(() => {
    const m = this._metrics();
    return m ? metricsView(m) : null;
  });

  private requestId = 0;

  /** Pide las métricas (de nuevo solo si cambió la consulta). */
  load(query: MetricsQuery, now = new Date()): void {
    const prev = this._query();
    if (prev && sameQuery(prev, query) && (this._metrics() || this._loading())) return;
    const id = ++this.requestId;
    this._query.set(query);
    this._loading.set(true);
    this._error.set(false);
    if (prev?.projectId !== query.projectId) this._metrics.set(null);
    this.client
      .getFlowMetrics(query.projectId, {
        from: periodStart(now, query.weeks).toISOString(),
        timeZone: browserTimeZone(),
        labelIds: query.labelIds,
        staleLimit: 10,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          if (id !== this.requestId) return;
          this._metrics.set(m);
          this._loading.set(false);
        },
        error: () => {
          if (id !== this.requestId) return;
          this._error.set(true);
          this._loading.set(false);
        },
      });
  }
}

function sameQuery(a: MetricsQuery, b: MetricsQuery): boolean {
  return (
    a.projectId === b.projectId &&
    a.weeks === b.weeks &&
    a.labelIds.length === b.labelIds.length &&
    a.labelIds.every((id, i) => id === b.labelIds[i])
  );
}

/**
 * Sesiones de agentes de UN proyecto (issue 026, `ListAgentSessions`): las
 * activas de la persona. Provisto en la ruta `agentes`; la página lo refresca
 * cada 30 s mientras la pestaña está visible.
 */
@Injectable()
export class AgentsStore {
  private readonly client = inject(MetricsClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _projectId = signal('');
  private readonly _sessions = signal<readonly AgentSession[]>([]);
  private readonly _loaded = signal(false);
  private readonly _error = signal(false);
  private readonly _updatedAt = signal<Date | null>(null);

  readonly sessions = this._sessions.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();
  readonly updatedAt = this._updatedAt.asReadonly();

  private requestId = 0;

  /** Pide las sesiones activas del proyecto (refresco sin vaciar la lista). */
  load(projectId: string, now: () => Date = () => new Date()): void {
    if (!projectId) return;
    const id = ++this.requestId;
    if (projectId !== this._projectId()) {
      this._projectId.set(projectId);
      this._sessions.set([]);
      this._loaded.set(false);
    }
    this.client
      .listAgentSessions({ projectId, limit: 100 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (id !== this.requestId) return;
          this._sessions.set(res.sessions);
          this._error.set(false);
          this._loaded.set(true);
          this._updatedAt.set(now());
        },
        error: () => {
          if (id !== this.requestId) return;
          // Un refresco que falla deja la lista anterior a la vista.
          this._error.set(true);
          this._loaded.set(true);
        },
      });
  }
}
