-- Track when flashcard study progress was last updated (for decay logic).
alter table public.words
  add column if not exists study_progress_at timestamptz;

comment on column public.words.study_progress_at is
  'Last time study_progress was updated via flashcard review.';
