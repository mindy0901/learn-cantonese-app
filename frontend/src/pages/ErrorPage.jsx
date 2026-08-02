import { Link } from "react-router-dom";
import { useDataError } from "../store/appStore.js";
import { useLocale } from "../store/localeStore.js";

const pageClass = "flex-1 w-full px-5 py-8 pb-12";

const emptyStateClass = "text-center py-12 px-6 text-text-muted flex flex-col items-center gap-4";

export function ErrorPage() {
    const { t } = useLocale();
    const dataError = useDataError();

    const message = dataError?.message ?? "Unknown error";
    const status = dataError?.status;

    return (
        <div className={pageClass}>
            <div className={emptyStateClass}>
                <h1 className="text-xl font-semibold text-text-h m-0">{t.data.errorTitle}</h1>
                <p className="m-0">{t.data.errorBody}</p>
                <div
                    className="px-4 py-3 rounded-lg text-sm bg-error-bg text-error-text border border-error-border max-w-lg w-full text-left"
                    role="alert"
                >
                    <p className="m-0 font-medium">{message}</p>
                    {status != null && (
                        <p className="m-0 mt-1 text-xs opacity-75">
                            {t.data.errorStatus}: {status}
                        </p>
                    )}
                </div>
                <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white no-underline text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                    {t.data.errorBack}
                </Link>
            </div>
        </div>
    );
}
