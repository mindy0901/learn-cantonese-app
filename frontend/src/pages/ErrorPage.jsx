import { Link } from "react-router-dom";
import { Button } from "../components/shadcn/button.jsx";
import { useDataError } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";
import { vocabularyBankPath } from "../lib/wordRoutes.js";

const pageClass = "flex-1 w-full px-4 py-8 pb-12";

/**
 * 404 / error page — adapted from Tailwind's "404 Pages · Simple" UI block
 * (https://tailwindcss.com/plus/ui-blocks/marketing/feedback/404-pages), mapped
 * to the app's design tokens (accent/surface/text).
 */
export function ErrorPage() {
    const { t } = useLocale();
    const dataError = useDataError();

    const message = dataError?.message ?? "Unknown error";
    const status = dataError?.status;
    const statusLabel = status != null ? String(status) : "404";

    return (
        <main className={pageClass}>
            <div className="mx-auto grid w-full max-w-2xl place-items-center py-16 sm:py-24">
                <div className="text-center">
                    <p className="text-base font-semibold text-primary">{statusLabel}</p>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
                        {t.data.notFoundTitle}
                    </h1>
                    <p className="mt-6 text-base leading-7 text-muted-foreground">{t.data.notFoundBody}</p>

                    {dataError && (
                        <div
                            className="mt-6 mx-auto w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive"
                            role="alert"
                        >
                            <p className="m-0 font-medium">{message}</p>
                            {status != null && (
                                <p className="m-0 mt-1 text-xs opacity-75">
                                    {t.data.errorStatus}: {status}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
                        <Button nativeButton={false} render={<Link to="/" />}>
                            {t.data.goBackHome}
                        </Button>
                        <Button nativeButton={false} variant="link" render={<Link to={vocabularyBankPath()} />}>
                            {t.data.browseVocabularies}
                            <span aria-hidden="true" className="ml-1">
                                &rarr;
                            </span>
                        </Button>
                    </div>
                </div>
            </div>
        </main>
    );
}
