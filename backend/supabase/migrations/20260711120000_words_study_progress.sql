-- Per-word flashcard study progress (0–100%).
alter table public.words
  add column if not exists study_progress smallint not null default 0
    check (study_progress >= 0 and study_progress <= 100);

comment on column public.words.study_progress is
  'Flashcard mastery progress from 0 to 100. Reaching 100 marks the word as mastered.';
