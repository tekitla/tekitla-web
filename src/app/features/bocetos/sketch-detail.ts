import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  ACTORS,
  STATUSES,
  type SketchIssue,
  TOOL_NAME,
  actorById,
  isOverdue,
  issueKey,
  shortDate,
} from './bocetos.data';
import { SketchAvatar } from './sketch-avatar';
import { SketchIcon } from './sketch-icon';

/**
 * Detalle del issue en panel lateral (parte 1). `docked`: ocupa una columna a
 * la derecha y el tablero se angosta. `overlay`: hoja por encima del tablero,
 * más ancha, sin oscurecerlo.
 */
@Component({
  selector: 'app-sketch-detail',
  imports: [SketchIcon, SketchAvatar],
  template: `
    <aside
      class="sketch-detail"
      [class.sketch-detail--overlay]="mode() === 'overlay'"
      [attr.aria-label]="'Detalle de ' + key()"
    >
      <header class="sketch-detail__bar">
        <span class="vrb-kanban-card__code">{{ key() }}</span>
        <span class="sketch-detail__nav">
          <button
            type="button"
            class="vrb-button vrb-button--ghost vrb-button--sm vrb-button--icon"
            title="Anterior (↑)"
            (click)="step.emit(-1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="vrb-button vrb-button--ghost vrb-button--sm vrb-button--icon"
            title="Siguiente (↓)"
            (click)="step.emit(1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="vrb-button vrb-button--ghost vrb-button--sm vrb-button--icon"
            title="Abrir en página completa"
          >
            <app-sketch-icon name="expand" />
          </button>
          <button
            type="button"
            class="vrb-button vrb-button--ghost vrb-button--sm vrb-button--icon"
            title="Cerrar (Esc)"
            (click)="closed.emit()"
          >
            <app-sketch-icon name="x" />
          </button>
        </span>
      </header>

      <div class="sketch-detail__body">
        <h2 class="sketch-detail__title">{{ issue().title }}</h2>

        <dl class="sketch-detail__props">
          <dt>Estado</dt>
          <dd>
            <div class="vrb-select">
              <select class="vrb-input sketch-detail__select" [value]="issue().statusId">
                @for (s of statuses; track s.id) {
                  <option [value]="s.id" [selected]="s.id === issue().statusId">
                    {{ s.name }}
                  </option>
                }
              </select>
            </div>
          </dd>
          <dt>Asignado</dt>
          <dd class="sketch-detail__who">
            @if (assignee(); as a) {
              <app-sketch-avatar [actor]="a" />
              <span>
                {{ a.name }}
                @if (a.kind === 'AGENT') {
                  <small class="sketch-detail__hint"
                    >{{ toolName[a.tool ?? 'OTHER'] }} · de {{ owner() }}</small
                  >
                }
              </span>
            } @else {
              <span class="sketch-detail__hint">Sin asignar</span>
            }
          </dd>
          <dt>Prioridad</dt>
          <dd>
            <span
              class="vrb-kanban-card"
              [attr.data-priority]="issue().priority"
              style="display: contents"
            >
              <span class="vrb-kanban-card__priority">{{ issue().priority }}</span>
            </span>
          </dd>
          <dt>Fecha límite</dt>
          <dd>
            @if (issue().due; as due) {
              <span [class.sketch-detail__overdue]="overdue()">
                {{ shortDate(due) }}{{ overdue() ? ' · vencida' : '' }}
              </span>
            } @else {
              <span class="sketch-detail__hint">—</span>
            }
          </dd>
          <dt>Etiquetas</dt>
          <dd>
            <ul class="vrb-kanban-card__labels">
              @for (l of issue().labels; track l.name) {
                <li [class]="'vrb-kanban-card__label vrb-kanban-card__label--' + l.tone">
                  {{ l.name }}
                </li>
              }
            </ul>
          </dd>
          @if (issue().branch; as b) {
            <dt>Rama</dt>
            <dd class="sketch-detail__mono">
              {{ b.name }}{{ b.mr ? ' · MR !' + b.mr : '' }}
              <span [class]="'vrb-badge vrb-badge--dot ' + ciBadge[b.ci]">{{ ciText[b.ci] }}</span>
            </dd>
          }
        </dl>

        @if (issue().description) {
          <section class="sketch-detail__section">
            <h3 class="sketch-detail__h">Descripción</h3>
            <p>{{ issue().description }}</p>
          </section>
        }

        @if (issue().sub; as s) {
          <section class="sketch-detail__section">
            <h3 class="sketch-detail__h">Sub-issues · {{ s[0] }}/{{ s[1] }}</h3>
            <progress class="vrb-progress vrb-progress--sm" [value]="s[0]" [max]="s[1]"></progress>
            <ul class="sketch-detail__subs">
              @for (i of subRange(); track i) {
                <li>
                  <label class="vrb-check">
                    <input type="checkbox" class="vrb-check__input" [checked]="i < s[0]" />
                    <span class="vrb-check__box"></span>
                    <span class="vrb-check__label">{{ subTitles[i % subTitles.length] }}</span>
                  </label>
                </li>
              }
            </ul>
          </section>
        }

        <section class="sketch-detail__section">
          <h3 class="sketch-detail__h">Actividad</h3>
          <ol class="sketch-detail__activity">
            <li><b>Ana Torres</b> movió a En curso · hace 2 h</li>
            <li><b>Claude Code PC-01</b> abrió la rama · ayer</li>
            <li><b>Luis Méndez</b> creó el issue · 8 nov</li>
          </ol>
        </section>
      </div>
    </aside>
  `,
  styles: `
    :host {
      display: block;
      min-height: 0;
    }
    .sketch-detail {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      border: 1px solid var(--vrb-card-border);
      border-radius: var(--vrb-radius-card);
      background: var(--vrb-surface);
      box-shadow: var(--vrb-shadow-card);
    }
    .sketch-detail--overlay {
      border-radius: var(--vrb-radius-overlay) 0 0 var(--vrb-radius-overlay);
      box-shadow: var(--vrb-shadow-overlay);
    }
    .sketch-detail__bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vrb-border);
    }
    .sketch-detail__nav {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .sketch-detail__body {
      overflow-y: auto;
      padding: 16px 20px 24px;
      display: grid;
      gap: 20px;
      align-content: start;
    }
    .sketch-detail__title {
      margin: 0;
      font: 600 20px/28px var(--vrb-font-sans);
    }
    .sketch-detail__props {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 10px 12px;
      margin: 0;
      align-items: center;
      font-size: 13px;
    }
    .sketch-detail__props dt {
      color: var(--vrb-muted-fg);
    }
    .sketch-detail__props dd {
      margin: 0;
      min-width: 0;
    }
    .sketch-detail__select {
      height: var(--vrb-control-h-sm);
      font-size: 13px;
    }
    .sketch-detail__who {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sketch-detail__hint {
      display: block;
      color: var(--vrb-muted-fg);
      font-size: 12px;
    }
    .sketch-detail__overdue {
      color: var(--vrb-danger);
      font-weight: 600;
    }
    .sketch-detail__mono {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font: 12px/1.4 var(--vrb-font-mono);
    }
    .sketch-detail__section {
      display: grid;
      gap: 8px;
      font-size: 14px;
    }
    .sketch-detail__section p {
      margin: 0;
    }
    .sketch-detail__h {
      margin: 0;
      font: 600 12px/16px var(--vrb-font-sans);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vrb-muted-fg);
    }
    .sketch-detail__subs,
    .sketch-detail__activity {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .sketch-detail__activity {
      font-size: 13px;
      color: var(--vrb-muted-fg);
    }
    .sketch-detail__activity b {
      color: var(--vrb-fg);
      font-weight: 500;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SketchDetail {
  readonly issue = input.required<SketchIssue>();
  readonly mode = input<'docked' | 'overlay'>('docked');
  readonly closed = output<void>();
  readonly step = output<-1 | 1>();

  protected readonly statuses = STATUSES;
  protected readonly actors = ACTORS;
  protected readonly toolName = TOOL_NAME;
  protected readonly shortDate = shortDate;
  protected readonly key = computed(() => issueKey(this.issue().number));
  protected readonly assignee = computed(() => actorById(this.issue().assigneeId));
  protected readonly owner = computed(() => actorById(this.assignee()?.ownerId)?.name ?? '');
  protected readonly overdue = computed(() => isOverdue(this.issue()));
  protected readonly subRange = computed(() => [...Array(this.issue().sub?.[1] ?? 0).keys()]);
  protected readonly subTitles = [
    'Modelo de turnos en la API',
    'Vista semanal',
    'Intercambio entre vecinos',
    'Aviso a los dos vecinos',
  ];
  protected readonly ciText = { ok: 'CI en verde', fail: 'CI falló', running: 'CI corriendo' };
  protected readonly ciBadge = {
    ok: 'vrb-badge--success',
    fail: 'vrb-badge--danger',
    running: 'vrb-badge--warning',
  };
}
