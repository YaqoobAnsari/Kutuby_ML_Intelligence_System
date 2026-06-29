import * as React from 'react';
import type { LetterConfusion } from '@/lib/data/model-intelligence';

/** Props for {@link ConfusionMatrix}. */
export interface ConfusionMatrixProps {
  /** The computed letter confusion matrix. */
  confusion: LetterConfusion;
}

/** Background for a cell: emerald on the (correct) diagonal, red off-diagonal. */
function cellStyle(count: number, rowTotal: number, isDiagonal: boolean): React.CSSProperties {
  if (count === 0 || rowTotal === 0) return {};
  const alpha = Math.min(0.9, 0.15 + (count / rowTotal) * 0.85);
  const rgb = isDiagonal ? '16, 185, 129' : '239, 68, 68';
  return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

/**
 * 28×28 letter confusion matrix (target rows × predicted columns). The diagonal
 * is correct predictions (emerald); off-diagonal mass (red) shows which letters
 * the model confuses. Cell opacity scales with the within-target share.
 */
export function ConfusionMatrix({ confusion }: ConfusionMatrixProps): React.ReactElement {
  const { labels, glyphs, rows } = confusion;

  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-0 text-[10px]">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-background p-1 text-left font-medium text-muted-foreground">
              target ＼ pred
            </th>
            {labels.map((label) => (
              <th
                key={label}
                title={label}
                className="h-7 w-7 p-0 text-center align-middle font-normal text-muted-foreground"
              >
                {glyphs[label] || label.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.target}>
              <th
                title={`${row.target} — ${row.correct}/${row.total} correct`}
                className="sticky left-0 z-10 whitespace-nowrap bg-background px-2 py-0.5 text-right font-normal text-muted-foreground"
              >
                <span className="mr-1 text-sm text-foreground">{glyphs[row.target]}</span>
                {row.target}
              </th>
              {labels.map((pred) => {
                const count = row.cells[pred] ?? 0;
                const diag = pred === row.target;
                return (
                  <td
                    key={pred}
                    title={`${row.target} → ${pred}: ${count}`}
                    style={cellStyle(count, row.total, diag)}
                    className="h-7 w-7 border border-border/40 text-center align-middle tabular-nums"
                  >
                    {count > 0 ? count : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
