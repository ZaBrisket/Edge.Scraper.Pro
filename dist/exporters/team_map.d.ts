/**
 * Historical NFL team mapping for Pro Football Reference codes
 * Maps PFR team codes to full team names and canonical abbreviations by season
 */
export interface TeamInfo {
    team_full: string;
    team_abbrs: string;
}
/**
 * Get team information for a given PFR team code and season
 */
export declare function getTeamInfo(pfrCode: string, season: number): TeamInfo;
/**
 * Handle multi-team seasons (2TM, 3TM, etc.)
 */
export declare function getMultiTeamInfo(): TeamInfo;
/**
 * Normalize team code variations
 */
export declare function normalizeTeamCode(code: string): string;
//# sourceMappingURL=team_map.d.ts.map