import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  listAllClassSectionCodes,
  getQuizSectionCodes,
  updateQuizSectionsByCodes,
} from '@/services/quizService';

/**
 * ClassSectionsEditor
 *
 * Default (uncontrolled) mode:
 * - Loads current selection from DB and shows a "Save Sections" button that persists them.
 *
 * Controlled mode (preferred for QuizEdit main save):
 * - Pass `value` and `onValueChange`, and set `showSaveButton={false}`.
 * - Parent is responsible for calling `updateQuizSectionsByCodes` on save.
 */
type Props = {
  quizId: string;

  /** Controlled selection (optional). If provided, internal state mirrors this value. */
  value?: string[];
  /** Controlled setter (optional). If provided, editor reports every change upward. */
  onValueChange?: (codes: string[]) => void;

  /** Hide internal save button when parent handles save (default: true in uncontrolled mode). */
  showSaveButton?: boolean;

  /** Called after DB save (uncontrolled mode) or after user toggles (controlled mode). */
  onChanged?: (codes: string[]) => void;
};

export default function ClassSectionsEditor({
  quizId,
  value,
  onValueChange,
  showSaveButton,
  onChanged,
}: Props) {
  const controlled = Array.isArray(value) && typeof onValueChange === 'function';
  const [available, setAvailable] = useState<{ id: string; code: string }[]>([]);
  const [internalCodes, setInternalCodes] = useState<string[]>([]);
  const selectedCodes = controlled ? (value as string[]) : internalCodes;

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const effectiveShowSave = useMemo(() => {
    // If parent is controlling the value, default to NOT showing Save here.
    if (typeof showSaveButton === 'boolean') return showSaveButton;
    return !controlled;
  }, [controlled, showSaveButton]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        setLoading(true);
        const [all, picked] = await Promise.all([
          listAllClassSectionCodes(),
          getQuizSectionCodes(quizId),
        ]);
        if (!live) return;
        setAvailable(all);
        if (controlled) {
          // parent drives selection; leave it alone
        } else {
          setInternalCodes(picked);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [quizId, controlled]);

  // Keep internal mirror in sync when controlled value changes from parent
  useEffect(() => {
    if (controlled) {
      setInternalCodes(value || []);
    }
  }, [controlled, value]);

  const setCodes = (next: string[]) => {
    if (controlled) {
      onValueChange?.(next);
      onChanged?.(next);
    } else {
      setInternalCodes(next);
    }
  };

  const toggle = (code: string, checked: boolean) => {
    setCodes(
      checked
        ? Array.from(new Set([...(selectedCodes || []), code]))
        : (selectedCodes || []).filter((c) => c !== code)
    );
  };

  const selectAll = () => setCodes(available.map((a) => a.code));
  const clearAll = () => setCodes([]);

  const save = async () => {
    setBusy(true);
    try {
      await updateQuizSectionsByCodes(quizId, selectedCodes || []);
      onChanged?.(selectedCodes || []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <Label>Class Sections</Label>
          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {loading ? 'Loading…' : `${(selectedCodes || []).length} selected`}
              </span>
              <div className="space-x-1">
                <Button type="button" variant="ghost" size="sm" onClick={selectAll} disabled={loading}>
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  disabled={loading || (selectedCodes || []).length === 0}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-44 overflow-auto px-3 pb-2 pt-1">
              {available.map(({ code }) => {
                const checked = (selectedCodes || []).includes(code);
                return (
                  <label
                    key={code}
                    className="flex items-center gap-3 py-1.5 cursor-pointer select-none hover:bg-muted/60 rounded-md px-2"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={(e) => toggle(code, e.target.checked)}
                      disabled={loading}
                    />
                    <span className="text-sm">{code}</span>
                  </label>
                );
              })}
              {!loading && available.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1.5">No sections found.</p>
              )}
            </div>
          </div>
          {effectiveShowSave && (
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={busy || loading}>
                Save Sections
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}