import { Button } from "./shadcn/button.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./shadcn/dialog.jsx";
import { BtnSpinner } from "./LoadingButton.jsx";

export function ConfirmDialog({
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    danger,
    loading = false,
    loadingText,
}) {
    return (
        <Dialog open onOpenChange={(open) => !open && !loading && onCancel?.()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{message}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={onCancel} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    <Button variant={danger ? "destructive" : "default"} onClick={onConfirm} disabled={loading}>
                        {loading && <BtnSpinner size="sm" />}
                        {loading ? (loadingText ?? confirmLabel) : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
