import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  type SketchIssue,
  TOOL_NAME,
  actorById,
  isOverdue,
  issueKey,
  shortDate,
} from './bocetos.data';
import { SketchAvatar } from './sketch-avatar';
import { SketchIcon } from './sketch-icon';

export type Density = 'comoda' | 'compacta';

export interface CardPick {
  readonly number: number;
  /** Ctrl, Cmd o Shift: suma a la selección en vez de abrir. */
  readonly multi: boolean;
}

/**
 * Tarjeta del boceto (`vrb-kanban-card`). Cómoda: todo lo que puede llevar
 * (asignado, sub-issues, rama con CI, fecha). Compacta: clave, título y una
 * fila de iconos.
 */
@Component({
  selector: 'app-sketch-card',
  imports: [SketchIcon, SketchAvatar],
  template: `
    <article
      class="vrb-kanban-card sketch-card"
      [class.sketch-card--compact]="density() === 'compacta'"
      [class.sketch-card--active]="active()"
      [class.sketch-card--selected]="selected()"
      [attr.data-priority]="issue().priority"
      [attr.aria-selected]="selected() || null"
    >
      @if (selected()) {
        <span class="sketch-card__tick" aria-hidden="true"><app-sketch-icon name="check" /></span>
      }
      @if (density() === 'comoda') {
        <div class="sketch-card__top">
          <span class="vrb-kanban-card__code">{{ key() }}</span>
          @if (issue().branch; as b) {
            <span
              class="sketch-card__ci"
              [attr.data-ci]="b.ci"
              [title]="'CI: ' + ciText[b.ci] + ' · ' + b.name"
            >
              <app-sketch-icon name="branch" />{{ b.mr ? '!' + b.mr : 'rama' }}
            </span>
          }
        </div>
        <button
          type="button"
          class="vrb-kanban-card__title sketch-card__link"
          (click)="pick($event)"
        >
          {{ issue().title }}
        </button>
        @if (issue().labels.length) {
          <ul class="vrb-kanban-card__labels">
            @for (l of issue().labels; track l.name) {
              <li [class]="'vrb-kanban-card__label vrb-kanban-card__label--' + l.tone">
                {{ l.name }}
              </li>
            }
          </ul>
        }
        <footer class="vrb-kanban-card__meta">
          <span class="vrb-kanban-card__priority">{{ issue().priority }}</span>
          @if (issue().sub; as s) {
            <span class="sketch-card__sub" [class.sketch-card__sub--done]="s[0] === s[1]">
              <app-sketch-icon name="subtasks" />{{ s[0] }}/{{ s[1] }}
            </span>
          }
          @if (issue().due; as due) {
            <time
              class="vrb-kanban-card__due"
              [attr.datetime]="due"
              [attr.data-overdue]="overdue() || null"
            >
              <app-sketch-icon name="calendar" />{{ shortDate(due) }}
            </time>
          }
          <span class="sketch-card__who">
            @if (assignee(); as a) {
              @if (a.kind === 'AGENT') {
                <span class="sketch-card__agent-name">{{ a.name }}</span>
              }
              <app-sketch-avatar [actor]="a" />
            } @else {
              <span class="sketch-card__unassigned" title="Sin asignar">
                <app-sketch-icon name="user" />
              </span>
            }
          </span>
        </footer>
      } @else {
        <div class="sketch-card__row">
          <span class="sketch-card__dot" aria-hidden="true"></span>
          <span class="vrb-kanban-card__code">{{ key() }}</span>
          <button
            type="button"
            class="sketch-card__link sketch-card__title-compact"
            (click)="pick($event)"
          >
            {{ issue().title }}
          </button>
        </div>
        <div class="sketch-card__row sketch-card__row--meta">
          @for (l of issue().labels; track l.name) {
            <span
              [class]="'sketch-card__label-dot sketch-card__label-dot--' + l.tone"
              [title]="l.name"
            ></span>
          }
          @if (issue().sub; as s) {
            <span class="sketch-card__sub" [class.sketch-card__sub--done]="s[0] === s[1]">
              <app-sketch-icon name="subtasks" />{{ s[0] }}/{{ s[1] }}
            </span>
          }
          @if (issue().branch; as b) {
            <span class="sketch-card__ci" [attr.data-ci]="b.ci" [title]="'CI: ' + ciText[b.ci]">
              <app-sketch-icon name="branch" />
            </span>
          }
          @if (issue().due; as due) {
            <time
              class="vrb-kanban-card__due"
              [attr.datetime]="due"
              [attr.data-overdue]="overdue() || null"
            >
              {{ shortDate(due) }}
            </time>
          }
          <span class="sketch-card__who">
            @if (assignee(); as a) {
              <app-sketch-avatar [actor]="a" size="sm" />
            }
          </span>
        </div>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .sketch-card {
      position: relative;
      cursor: pointer;
    }
    .sketch-card--compact {
      gap: 4px;
      padding: 8px 10px;
    }
    .sketch-card--active {
      border-color: var(--vrb-brand);
      box-shadow:
        0 0 0 1px var(--vrb-brand),
        var(--vrb-shadow-raise);
    }
    .sketch-card--selected {
      background: color-mix(in oklab, var(--vrb-brand) 7%, var(--vrb-surface));
      border-color: color-mix(in oklab, var(--vrb-brand) 55%, var(--vrb-border));
    }
    .sketch-card__tick {
      position: absolute;
      top: -6px;
      left: -6px;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      border-radius: 9999px;
      background: var(--vrb-brand);
      color: var(--vrb-brand-fg);
      --ui-icon-size: 12px;
    }
    .sketch-card__top,
    .sketch-card__row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .sketch-card__top {
      justify-content: space-between;
    }
    .sketch-card__row--meta {
      gap: 6px;
      color: var(--vrb-muted-fg);
      font-size: 12px;
    }
    .sketch-card__link {
      padding: 0;
      border: 0;
      background: none;
      text-align: left;
      cursor: pointer;
      color: var(--vrb-fg);
      font: inherit;
    }
    .sketch-card__link::after {
      content: '';
      position: absolute;
      inset: 0;
    }
    .vrb-kanban-card__title.sketch-card__link {
      font: 500 14px/20px var(--vrb-font-sans);
    }
    .sketch-card__title-compact {
      min-width: 0;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-weight: 500;
      line-height: 18px;
    }
    .sketch-card .vrb-kanban-card__code {
      white-space: nowrap;
    }
    .sketch-card__row:first-child {
      align-items: baseline;
    }
    .sketch-card__row:first-child .sketch-card__dot {
      align-self: center;
    }
    .sketch-card__dot {
      width: 7px;
      height: 7px;
      flex-shrink: 0;
      border-radius: 9999px;
      background: var(--tone);
    }
    .sketch-card__label-dot {
      --label: var(--vrb-muted-fg);
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: var(--label);
    }
    .sketch-card__label-dot--info {
      --label: var(--vrb-info);
    }
    .sketch-card__label-dot--accent {
      --label: var(--vrb-accent);
    }
    .sketch-card__label-dot--brand {
      --label: var(--vrb-brand);
    }
    .sketch-card__label-dot--danger {
      --label: var(--vrb-danger);
    }
    .sketch-card__sub,
    .sketch-card__ci {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: 500 11px/1 var(--vrb-font-mono);
      color: var(--vrb-muted-fg);
      --ui-icon-size: 12px;
    }
    .sketch-card__sub--done {
      color: var(--vrb-success);
    }
    .sketch-card__ci {
      position: relative;
      z-index: 1;
    }
    .sketch-card__ci::after {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 9999px;
      background: var(--vrb-muted-fg);
    }
    .sketch-card__ci[data-ci='ok']::after {
      background: var(--vrb-success);
    }
    .sketch-card__ci[data-ci='fail']::after {
      background: var(--vrb-danger);
    }
    .sketch-card__ci[data-ci='running']::after {
      background: var(--vrb-warning);
    }
    .sketch-card__who {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      min-width: 0;
    }
    .sketch-card__agent-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
    .sketch-card__unassigned {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: 1px dashed var(--vrb-border);
      border-radius: 9999px;
      color: var(--vrb-muted-fg);
      --ui-icon-size: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SketchCard {
  readonly issue = input.required<SketchIssue>();
  readonly density = input<Density>('comoda');
  readonly active = input(false);
  readonly selected = input(false);
  readonly picked = output<CardPick>();

  protected readonly key = computed(() => issueKey(this.issue().number));
  protected readonly assignee = computed(() => actorById(this.issue().assigneeId));
  protected readonly overdue = computed(() => isOverdue(this.issue()));
  protected readonly shortDate = shortDate;
  protected readonly toolName = TOOL_NAME;
  protected readonly ciText = { ok: 'en verde', fail: 'falló', running: 'corriendo' };

  protected pick(event: MouseEvent): void {
    this.picked.emit({
      number: this.issue().number,
      multi: event.ctrlKey || event.metaKey || event.shiftKey,
    });
  }
}
