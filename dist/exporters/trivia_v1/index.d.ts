export interface RawPlayerData {
    id: string;
    url: string;
    profile: {
        name: string;
        position?: string;
        personal?: {
            birthDate?: string;
            birthPlace?: string;
            college?: string;
        };
    };
    statistics: {
        seasons: RawSeasonRow[];
    };
}
export interface RawSeasonRow {
    Season: number | string;
    Age?: number;
    Team?: string;
    Pos?: string;
    G?: number;
    GS?: number;
    Awards?: string;
    [key: string]: any;
}
export interface TriviaPlayer {
    player_id: string;
    full_name: string;
    pos: 'QB' | 'RB' | 'WR' | 'TE';
    college: string | null;
    birthdate: string | null;
    fun_fact: string | null;
}
export interface SeasonRowBase {
    player_id: string;
    season: number;
    age: number;
    team_full: string;
    team_abbrs: string;
    pos: string;
    G: number;
    GS: number;
    Awards: string[];
    multi_team: boolean;
}
export interface QBSeasonRow extends SeasonRowBase {
    pos: 'QB';
    Cmp?: number;
    Att?: number;
    CmpPct?: number;
    Yds?: number;
    TD?: number;
    Int?: number;
    Rate?: number;
    Sk?: number;
    SkYds?: number;
    'Y/A'?: number;
    'AY/A'?: number;
    'Y/C'?: number;
    'Y/G'?: number;
    'NY/A'?: number;
    'ANY/A'?: number;
    '4QC'?: number;
    GWD?: number;
}
export interface RBSeasonRow extends SeasonRowBase {
    pos: 'RB';
    Att?: number;
    Yds?: number;
    TD?: number;
    'Y/A'?: number;
    'Y/G'?: number;
    'A/G'?: number;
    Tgt?: number;
    Rec?: number;
    RecYds?: number;
    'Y/R'?: number;
    RecTD?: number;
    'R/G'?: number;
    'RecY/G'?: number;
    Touch?: number;
    'Y/Tch'?: number;
    YScm?: number;
    RRTD?: number;
    Fmb?: number;
}
export interface WRSeasonRow extends SeasonRowBase {
    pos: 'WR';
    Tgt?: number;
    Rec?: number;
    RecYds?: number;
    'Y/R'?: number;
    RecTD?: number;
    'R/G'?: number;
    'RecY/G'?: number;
    Fmb?: number;
    Att?: number;
    Yds?: number;
    TD?: number;
}
export interface TESeasonRow extends SeasonRowBase {
    pos: 'TE';
    Tgt?: number;
    Rec?: number;
    RecYds?: number;
    'Y/R'?: number;
    RecTD?: number;
    'R/G'?: number;
    'RecY/G'?: number;
    Fmb?: number;
    Att?: number;
    Yds?: number;
    TD?: number;
}
export interface EligibilityRow {
    player_id: string;
    rookie_year: number;
    seasons_with_G_ge_1: number;
    eligible_flag: boolean;
}
export interface TriviaDataset {
    schema: {
        name: 'trivia_v1';
        version: string;
    };
    players: TriviaPlayer[];
    qb_seasons: QBSeasonRow[];
    rb_seasons: RBSeasonRow[];
    wr_seasons: WRSeasonRow[];
    te_seasons: TESeasonRow[];
    eligibility: EligibilityRow[];
    daily_picks: Record<string, string>;
    generated_at: string;
}
export interface ExporterOptions {
    seasonMin?: number;
    seasonMax?: number;
    positions?: string[];
    requireGMin?: number;
    dropSummaryRows?: boolean;
    strict?: boolean;
    verbose?: boolean;
}
/**
 * Create a unique slug from a player name
 */
export declare function slugifyPlayerName(name: string, existingIds: Set<string>): string;
/**
 * Build trivia dataset from raw PFR data
 */
export declare function buildTriviaDataset(rawDataPath: string, options?: ExporterOptions): Promise<TriviaDataset>;
/**
 * Export trivia dataset to JSON file
 */
export declare function exportTriviaDataset(rawDataPath: string, outputPath: string, options?: ExporterOptions & {
    pretty?: boolean;
    validate?: boolean;
}): Promise<void>;
//# sourceMappingURL=index.d.ts.map