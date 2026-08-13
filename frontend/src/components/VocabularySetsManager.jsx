import { useEffect, useState } from "react";
import { cn } from "../lib/cn.js";
import { Button } from "./shadcn/button.jsx";
import { Input } from "./shadcn/input.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { useLocale } from "../store/localeStore.js";
import { useVocabularySets, useAppActions } from "../store/appStore.js";
import { IconPlus, IconTrash, IconEdit } from "./NavIcons.jsx";
import { EmptyState } from "./ui/EmptyState.jsx";

const SET_COLORS = ["#7c3aed", "#0ea5e9", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6"];

/** Modal quản lý các bộ từ vựng (custom vocabulary sets) của user. */
export function VocabularySetsManager({ onClose, onSelectSet }) {
    const { t, fmt } = useLocale();
    const sets = useVocabularySets();
    const { fetchVocabularySets, createVocabularySet, updateVocabularySet, deleteVocabularySet } = useAppActions();
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState("");

    useEffect(() => {
        fetchVocabularySets().catch(() => {});
    }, [fetchVocabularySets]);

    const handleCreate = async () => {
        const name = newName.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            const color = SET_COLORS[sets.length % SET_COLORS.length];
            const created = await createVocabularySet({ name, color });
            setNewName("");
            onSelectSet?.(created.id);
        } finally {
            setCreating(false);
        }
    };

    const startEdit = (set) => {
        setEditingId(set.id);
        setEditName(set.name);
    };

    const saveEdit = async (set) => {
        const name = editName.trim();
        if (name && name !== set.name) {
            await updateVocabularySet(set.id, { name }).catch(() => {});
        }
        setEditingId(null);
    };

    const handleDelete = async (set) => {
        if (!window.confirm(t.vocabSets.deleteConfirm)) return;
        await deleteVocabularySet(set.id).catch(() => {});
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="gap-0 p-0 sm:max-w-md">
                <DialogHeader className="border-b border-border px-6 py-4">
                    <DialogTitle className="text-lg">{t.vocabSets.title}</DialogTitle>
                </DialogHeader>

                <div className="flex max-h-[70vh] min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                    {/* Create new set */}
                    <div className="flex gap-2">
                        <Input
                            className="flex-1 min-w-0"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder={t.vocabSets.newPlaceholder}
                            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                        />
                        <Button
                            type="button"
                            variant="default"
                            onClick={handleCreate}
                            disabled={creating || !newName.trim()}
                        >
                            <IconPlus size={16} />
                            {t.vocabSets.addSet}
                        </Button>
                    </div>

                    {/* Set list */}
                    {sets.length === 0 ? (
                        <EmptyState title={t.vocabSets.empty} />
                    ) : (
                        <div className="flex flex-col gap-2">
                            {sets.map((set) => (
                                <div
                                    key={set.id}
                                    className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2"
                                >
                                    <span
                                        className="size-3 shrink-0 rounded-full"
                                        style={{ background: set.color || SET_COLORS[0] }}
                                    />
                                    {editingId === set.id ? (
                                        <>
                                            <Input
                                                className="flex-1 min-w-0"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && saveEdit(set)}
                                                autoFocus
                                            />
                                            <Button
                                                type="button"
                                                variant="default"
                                                size="sm"
                                                onClick={() => saveEdit(set)}
                                            >
                                                ✓
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                                                {set.name}
                                            </span>
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                {fmt(t.vocabSets.words, { count: set.count })}
                                            </span>
                                            <button
                                                type="button"
                                                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                                                onClick={() => startEdit(set)}
                                                title={t.common.edit}
                                            >
                                                <IconEdit size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-flex size-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                                                onClick={() => handleDelete(set)}
                                                title={t.common.delete}
                                            >
                                                <IconTrash size={15} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
