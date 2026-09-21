export type NflTeamRating = {
  offense: number;
  defense: number;
  passRush: number;
  coverage: number;
  specialTeams: number;
};

export type NflCoachingProfile = {
  headCoach: string;
  offensiveCoordinator?: string;
  defensiveCoordinator?: string;
  passRateTendency: "run-first" | "balanced" | "pass-heavy";
  coverageScheme: "man-heavy" | "zone-heavy" | "mixed";
  aggressiveness: "conservative" | "balanced" | "aggressive";
  notes: string;
};

export type NflTeamProfile = NflTeamRating & {
  coaching: NflCoachingProfile;
};

// 100 = league average (23.5 PPG). Higher offense = more scoring; higher defense = fewer pts allowed.
export const nflTeamProfiles: Record<string, NflTeamProfile> = {
  "Kansas City Chiefs": {
    offense: 112, defense: 108, passRush: 106, coverage: 109, specialTeams: 104,
    coaching: {
      headCoach: "Andy Reid", offensiveCoordinator: "Matt Nagy", defensiveCoordinator: "Steve Spagnuolo",
      passRateTendency: "pass-heavy", coverageScheme: "mixed", aggressiveness: "aggressive",
      notes: "Elite RPO and motion-heavy West Coast offense; defense shifts zone/man by down and distance.",
    },
  },
  "San Francisco 49ers": {
    offense: 110, defense: 109, passRush: 112, coverage: 107, specialTeams: 103,
    coaching: {
      headCoach: "Kyle Shanahan", defensiveCoordinator: "Nick Sorensen",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Zone-run heavy scheme with elite play-action; defense runs 4-3 base with heavy zone coverage.",
    },
  },
  "Baltimore Ravens": {
    offense: 109, defense: 110, passRush: 108, coverage: 110, specialTeams: 106,
    coaching: {
      headCoach: "John Harbaugh", offensiveCoordinator: "Todd Monken", defensiveCoordinator: "Zach Orr",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "aggressive",
      notes: "Lamar-led RPO and zone run; defense is Cover-2 and Cover-4 shell, elite in deep zones.",
    },
  },
  "Buffalo Bills": {
    offense: 111, defense: 107, passRush: 106, coverage: 108, specialTeams: 103,
    coaching: {
      headCoach: "Sean McDermott", defensiveCoordinator: "Bobby Babich",
      passRateTendency: "pass-heavy", coverageScheme: "man-heavy", aggressiveness: "aggressive",
      notes: "Allen-led vertical passing attack; defense is man-press heavy with aggressive zero coverages.",
    },
  },
  "Detroit Lions": {
    offense: 110, defense: 106, passRush: 107, coverage: 104, specialTeams: 103,
    coaching: {
      headCoach: "Dan Campbell", offensiveCoordinator: "Ben Johnson (retained)", defensiveCoordinator: "Aaron Glenn (retained)",
      passRateTendency: "balanced", coverageScheme: "mixed", aggressiveness: "aggressive",
      notes: "Physical run game with efficient play-action; defense is 4th-down aggressive and press-man capable.",
    },
  },
  "Philadelphia Eagles": {
    offense: 108, defense: 110, passRush: 112, coverage: 108, specialTeams: 104,
    coaching: {
      headCoach: "Nick Sirianni", defensiveCoordinator: "Vic Fangio",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Efficient RPO with strong run game; Fangio's defense is Tampa-2 and Cover-4 based with elite pass rush.",
    },
  },
  "Cincinnati Bengals": {
    offense: 107, defense: 104, passRush: 103, coverage: 105, specialTeams: 100,
    coaching: {
      headCoach: "Zac Taylor", defensiveCoordinator: "Lou Anarumo",
      passRateTendency: "pass-heavy", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Burrow-led vertical passing; defense is soft-zone underneath with press when healthy.",
    },
  },
  "Dallas Cowboys": {
    offense: 107, defense: 106, passRush: 107, coverage: 105, specialTeams: 102,
    coaching: {
      headCoach: "Mike McCarthy", defensiveCoordinator: "Mike Zimmer",
      passRateTendency: "balanced", coverageScheme: "man-heavy", aggressiveness: "balanced",
      notes: "Spread passing with Dak; Zimmer defense is man-press 4-3 with disguised coverages.",
    },
  },
  "Miami Dolphins": {
    offense: 108, defense: 100, passRush: 101, coverage: 100, specialTeams: 100,
    coaching: {
      headCoach: "Mike McDaniel", defensiveCoordinator: "Anthony Weaver",
      passRateTendency: "pass-heavy", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Speed-based air raid with Tua/Hill/Waddle; defense is aggressive Cover-3 and Cover-1 rotating.",
    },
  },
  "Houston Texans": {
    offense: 106, defense: 104, passRush: 105, coverage: 103, specialTeams: 101,
    coaching: {
      headCoach: "DeMeco Ryans", defensiveCoordinator: "Jerod Mayo",
      passRateTendency: "balanced", coverageScheme: "mixed", aggressiveness: "aggressive",
      notes: "Stroud-led efficient passing attack; defense is 3-4 base with 2-gap reads and mixed coverages.",
    },
  },
  "Los Angeles Chargers": {
    offense: 105, defense: 104, passRush: 104, coverage: 104, specialTeams: 101,
    coaching: {
      headCoach: "Jim Harbaugh", defensiveCoordinator: "Jesse Minter",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Harbaugh's run-first physical approach; defense is quarters-based zone with man in red zone.",
    },
  },
  "Minnesota Vikings": {
    offense: 105, defense: 103, passRush: 102, coverage: 104, specialTeams: 101,
    coaching: {
      headCoach: "Kevin O'Connell", defensiveCoordinator: "Brian Flores",
      passRateTendency: "pass-heavy", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "McPherson/Darnold-led West Coast passing; Flores defense is blitz-heavy disguised zone.",
    },
  },
  "Green Bay Packers": {
    offense: 106, defense: 102, passRush: 102, coverage: 102, specialTeams: 102,
    coaching: {
      headCoach: "Matt LaFleur", defensiveCoordinator: "Jeff Hafley",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Love-led RPO and motion; Hafley's 4-3 defense features Cover-2 and Cover-3 shells.",
    },
  },
  "Pittsburgh Steelers": {
    offense: 99, defense: 108, passRush: 110, coverage: 107, specialTeams: 103,
    coaching: {
      headCoach: "Mike Tomlin", defensiveCoordinator: "Teryl Austin",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Physical, field-position football; elite 3-4 pass rush with Cover-3 behind it.",
    },
  },
  "Cleveland Browns": {
    offense: 98, defense: 106, passRush: 108, coverage: 104, specialTeams: 101,
    coaching: {
      headCoach: "Kevin Stefanski", defensiveCoordinator: "Jim Schwartz",
      passRateTendency: "run-first", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Ground-and-pound with elite rushing; Schwartz defense is base 4-3 Cover-2 with aggressive stunts.",
    },
  },
  "Jacksonville Jaguars": {
    offense: 101, defense: 102, passRush: 102, coverage: 101, specialTeams: 100,
    coaching: {
      headCoach: "Doug Pederson", defensiveCoordinator: "Ryan Nielsen",
      passRateTendency: "balanced", coverageScheme: "mixed", aggressiveness: "balanced",
      notes: "Lawrence-led West Coast passing; defense is base 4-3 with mixed zone/man by game plan.",
    },
  },
  "New York Jets": {
    offense: 100, defense: 104, passRush: 106, coverage: 103, specialTeams: 100,
    coaching: {
      headCoach: "Robert Saleh", defensiveCoordinator: "Jeff Ulbrich",
      passRateTendency: "balanced", coverageScheme: "man-heavy", aggressiveness: "balanced",
      notes: "Rogers-led offense if healthy; defense is press-man heavy with Sauce Gardner as shutdown corner.",
    },
  },
  "Seattle Seahawks": {
    offense: 103, defense: 101, passRush: 100, coverage: 102, specialTeams: 102,
    coaching: {
      headCoach: "Mike Macdonald", defensiveCoordinator: "Aden Durde",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "aggressive",
      notes: "Geno/Lock-led offense with mobile QB threat; Macdonald defense is quarters-based with exotic blitzes.",
    },
  },
  "Los Angeles Rams": {
    offense: 105, defense: 100, passRush: 101, coverage: 100, specialTeams: 100,
    coaching: {
      headCoach: "Sean McVay", defensiveCoordinator: "Chris Shula",
      passRateTendency: "pass-heavy", coverageScheme: "zone-heavy", aggressiveness: "aggressive",
      notes: "McVay motion-heavy passing attack; defense is bend-don't-break Cover-3 with good front four.",
    },
  },
  "Tampa Bay Buccaneers": {
    offense: 103, defense: 101, passRush: 101, coverage: 101, specialTeams: 100,
    coaching: {
      headCoach: "Todd Bowles", defensiveCoordinator: "Kacy Rodgers",
      passRateTendency: "balanced", coverageScheme: "man-heavy", aggressiveness: "aggressive",
      notes: "Baker-led WCO; Bowles defense is man-press Tampa-2 hybrid with creative blitz packages.",
    },
  },
  "Atlanta Falcons": {
    offense: 101, defense: 99, passRush: 100, coverage: 99, specialTeams: 100,
    coaching: {
      headCoach: "Raheem Morris", defensiveCoordinator: "Jimmy Lake",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Penix-led downfield attack; defense running modern Cover-4 quarters with zone rotation.",
    },
  },
  "New Orleans Saints": {
    offense: 100, defense: 102, passRush: 101, coverage: 102, specialTeams: 101,
    coaching: {
      headCoach: "Dennis Allen", defensiveCoordinator: "Joe Woods",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Run-balanced offense; Woods defense is Cover-3 shell with occasional man-press packages.",
    },
  },
  "Washington Commanders": {
    offense: 103, defense: 99, passRush: 100, coverage: 99, specialTeams: 100,
    coaching: {
      headCoach: "Dan Quinn", defensiveCoordinator: "Joe Whitt Jr.",
      passRateTendency: "pass-heavy", coverageScheme: "mixed", aggressiveness: "balanced",
      notes: "Daniels-led RPO and athleticism; defense is man-zone mix with press corners.",
    },
  },
  "Denver Broncos": {
    offense: 100, defense: 100, passRush: 101, coverage: 100, specialTeams: 100,
    coaching: {
      headCoach: "Sean Payton", defensiveCoordinator: "Vance Joseph",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Nix-led young offense with Payton's nuanced play design; Joseph runs varied zone schemes.",
    },
  },
  "Tennessee Titans": {
    offense: 96, defense: 99, passRush: 99, coverage: 99, specialTeams: 100,
    coaching: {
      headCoach: "Brian Callahan", defensiveCoordinator: "Dennard Wilson",
      passRateTendency: "run-first", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Rebuilding with young QB; physical run-first offense; defense is 3-4 Cover-2.",
    },
  },
  "Indianapolis Colts": {
    offense: 99, defense: 100, passRush: 100, coverage: 100, specialTeams: 101,
    coaching: {
      headCoach: "Shane Steichen", defensiveCoordinator: "Gus Bradley",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Richardson-led athletic offense; Bradley's Tampa-2 and Cover-3 zone-based defense.",
    },
  },
  "Las Vegas Raiders": {
    offense: 96, defense: 97, passRush: 97, coverage: 97, specialTeams: 99,
    coaching: {
      headCoach: "Pete Carroll", defensiveCoordinator: "Patrick Graham",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Carroll's run-first philosophy; defense is Cover-3 and Cover-1 with zone tendencies.",
    },
  },
  "Chicago Bears": {
    offense: 100, defense: 97, passRush: 99, coverage: 97, specialTeams: 99,
    coaching: {
      headCoach: "Ben Johnson", defensiveCoordinator: "Dennis Allen",
      passRateTendency: "pass-heavy", coverageScheme: "mixed", aggressiveness: "aggressive",
      notes: "Caleb Williams high-potential offense under new HC Johnson; defense is Cover-2 and Cover-3.",
    },
  },
  "New York Giants": {
    offense: 95, defense: 97, passRush: 98, coverage: 96, specialTeams: 99,
    coaching: {
      headCoach: "Brian Daboll", defensiveCoordinator: "Shane Bowen",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Rebuilding with young QB; defense is 4-3 base Cover-3 with some press packages.",
    },
  },
  "Arizona Cardinals": {
    offense: 97, defense: 96, passRush: 96, coverage: 96, specialTeams: 98,
    coaching: {
      headCoach: "Jonathan Gannon", defensiveCoordinator: "Nick Rallis",
      passRateTendency: "pass-heavy", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Murray-led pass-heavy air raid; defense is Cover-3 and Cover-2 with rotation.",
    },
  },
  "New England Patriots": {
    offense: 94, defense: 98, passRush: 98, coverage: 98, specialTeams: 101,
    coaching: {
      headCoach: "Jerod Mayo", defensiveCoordinator: "DeMarcus Covington",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "conservative",
      notes: "Post-Belichick rebuilding; Mayo defense carries Belichick's hybrid zone principles.",
    },
  },
  "Carolina Panthers": {
    offense: 92, defense: 95, passRush: 95, coverage: 94, specialTeams: 98,
    coaching: {
      headCoach: "Dave Canales", defensiveCoordinator: "Ejiro Evero",
      passRateTendency: "balanced", coverageScheme: "zone-heavy", aggressiveness: "balanced",
      notes: "Young QB Bryce Young development; Evero's defense is quarters-based zone coverage.",
    },
  },
};

// Home field advantage in points — used in margin projection
export const NFL_HOME_FIELD_ADVANTAGE = 2.6;
export const NFL_BASE_PPG = 23.5;
export const NFL_SCORE_STD_DEV = 12.5; // standard deviation of margin for win prob calc
