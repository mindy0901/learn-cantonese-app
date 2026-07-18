-- Junction table: words <-> han_characters (many-to-many)
-- Links each word to the han characters that appear in it (hanTraditional + hanSimplified)

create table if not exists public.word_han_characters (
    id uuid primary key default gen_random_uuid(),
    word_id uuid not null references public.words(id) on delete cascade,
    han_character_id uuid not null references public.han_characters(id) on delete cascade,
    created_at timestamptz not null default now(),
    unique(word_id, han_character_id)
);

-- Index for fast lookup: find all han chars for a word
create index if not exists idx_whc_word_id on public.word_han_characters(word_id);

-- Index for fast lookup: find all words containing a han char
create index if not exists idx_whc_han_character_id on public.word_han_characters(han_character_id);

-- Enable RLS
alter table public.word_han_characters enable row level security;

-- RLS: users can read their own word-han relationships (via word ownership)
create policy "Users can read own word_han_characters"
    on public.word_han_characters for select
    using (
        exists (
            select 1 from public.words
            where words.id = word_han_characters.word_id
            and words.user_id = auth.uid()
        )
    );

-- RLS: users can insert their own relationships
create policy "Users can insert own word_han_characters"
    on public.word_han_characters for insert
    with check (
        exists (
            select 1 from public.words
            where words.id = word_han_characters.word_id
            and words.user_id = auth.uid()
        )
    );

-- RLS: users can delete their own relationships
create policy "Users can delete own word_han_characters"
    on public.word_han_characters for delete
    using (
        exists (
            select 1 from public.words
            where words.id = word_han_characters.word_id
            and words.user_id = auth.uid()
        )
    );
