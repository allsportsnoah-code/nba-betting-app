create table if not exists picks (
  id bigserial primary key,
  created_at timestamptz default now(),
  pick_date date not null,
  sport text not null, -- NBA, NFL, MLB
  market_scope text not null, -- team, player_prop, live
  market_type text not null, -- spread, total, moneyline, points, rebounds, assists, pra
  game_label text not null,
  home_team text,
  away_team text,
  player_name text,
  sportsbook text default 'DraftKings',
  side text not null,
  line_taken numeric,
  odds_taken int,
  stake_units numeric default 1,
  confidence_score numeric,
  projected_line numeric,
  market_line numeric,
  edge numeric,
  edge_label text,
  top_pick_rank int,
  is_top_pick boolean default false,
  status text default 'pending', -- pending, win, loss, push
  final_score text,
  final_stat numeric,
  closing_line numeric,
  clv numeric,
  notes text
);

create table if not exists daily_performance (
  id bigserial primary key,
  performance_date date not null,
  sport text not null,
  units_won numeric default 0,
  wins int default 0,
  losses int default 0,
  pushes int default 0,
  roi numeric default 0,
  created_at timestamptz default now()
);

create table if not exists model_feedback (
  id bigserial primary key,
  created_at timestamptz default now(),
  sport text not null,
  market_type text not null,
  game_label text,
  player_name text,
  projected_line numeric,
  market_line numeric,
  actual_result numeric,
  result_status text,
  edge numeric,
  confidence_score numeric,
  beat_closing_line boolean,
  closing_line numeric,
  projection_error numeric,
  note text
);