"use strict";
/**
 * Historical NFL team mapping for Pro Football Reference codes
 * Maps PFR team codes to full team names and canonical abbreviations by season
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamInfo = getTeamInfo;
exports.getMultiTeamInfo = getMultiTeamInfo;
exports.normalizeTeamCode = normalizeTeamCode;
const logger_1 = require("../lib/logger");
const logger = (0, logger_1.createLogger)('team-map');
// Team relocations and name changes by year
const TEAM_HISTORY = {
    // Teams with relocations/name changes
    SDG: {
        1961: { team_full: 'San Diego Chargers', team_abbrs: 'SDG' },
        2017: { team_full: 'Los Angeles Chargers', team_abbrs: 'LAC' },
    },
    LAC: {
        2017: { team_full: 'Los Angeles Chargers', team_abbrs: 'LAC' },
    },
    STL: {
        1995: { team_full: 'St. Louis Rams', team_abbrs: 'STL' },
        2016: { team_full: 'Los Angeles Rams', team_abbrs: 'LAR' },
    },
    LAR: {
        1946: { team_full: 'Los Angeles Rams', team_abbrs: 'LAR' },
        1995: { team_full: 'St. Louis Rams', team_abbrs: 'STL' },
        2016: { team_full: 'Los Angeles Rams', team_abbrs: 'LAR' },
    },
    OAK: {
        1960: { team_full: 'Oakland Raiders', team_abbrs: 'OAK' },
        1982: { team_full: 'Los Angeles Raiders', team_abbrs: 'LAI' },
        1995: { team_full: 'Oakland Raiders', team_abbrs: 'OAK' },
        2020: { team_full: 'Las Vegas Raiders', team_abbrs: 'LVR' },
    },
    LAI: {
        1982: { team_full: 'Los Angeles Raiders', team_abbrs: 'LAI' },
    },
    LVR: {
        2020: { team_full: 'Las Vegas Raiders', team_abbrs: 'LVR' },
    },
    OTI: {
        1997: { team_full: 'Tennessee Oilers', team_abbrs: 'OTI' },
        1999: { team_full: 'Tennessee Titans', team_abbrs: 'TEN' },
    },
    TEN: {
        1999: { team_full: 'Tennessee Titans', team_abbrs: 'TEN' },
    },
    PHO: {
        1988: { team_full: 'Phoenix Cardinals', team_abbrs: 'PHO' },
        1994: { team_full: 'Arizona Cardinals', team_abbrs: 'ARI' },
    },
    ARI: {
        1994: { team_full: 'Arizona Cardinals', team_abbrs: 'ARI' },
    },
};
// Static team mappings (teams that haven't moved/changed names in modern era)
const STATIC_TEAMS = {
    NOR: { team_full: 'New Orleans Saints', team_abbrs: 'NOR' },
    NO: { team_full: 'New Orleans Saints', team_abbrs: 'NOR' },
    ATL: { team_full: 'Atlanta Falcons', team_abbrs: 'ATL' },
    CAR: { team_full: 'Carolina Panthers', team_abbrs: 'CAR' },
    TB: { team_full: 'Tampa Bay Buccaneers', team_abbrs: 'TB' },
    TBB: { team_full: 'Tampa Bay Buccaneers', team_abbrs: 'TB' },
    CHI: { team_full: 'Chicago Bears', team_abbrs: 'CHI' },
    DET: { team_full: 'Detroit Lions', team_abbrs: 'DET' },
    GB: { team_full: 'Green Bay Packers', team_abbrs: 'GB' },
    GBP: { team_full: 'Green Bay Packers', team_abbrs: 'GB' },
    GNB: { team_full: 'Green Bay Packers', team_abbrs: 'GB' },
    MIN: { team_full: 'Minnesota Vikings', team_abbrs: 'MIN' },
    DAL: { team_full: 'Dallas Cowboys', team_abbrs: 'DAL' },
    NYG: { team_full: 'New York Giants', team_abbrs: 'NYG' },
    PHI: { team_full: 'Philadelphia Eagles', team_abbrs: 'PHI' },
    WAS: { team_full: 'Washington Commanders', team_abbrs: 'WAS' },
    WSH: { team_full: 'Washington Commanders', team_abbrs: 'WAS' },
    BUF: { team_full: 'Buffalo Bills', team_abbrs: 'BUF' },
    MIA: { team_full: 'Miami Dolphins', team_abbrs: 'MIA' },
    NE: { team_full: 'New England Patriots', team_abbrs: 'NE' },
    NEP: { team_full: 'New England Patriots', team_abbrs: 'NE' },
    NWE: { team_full: 'New England Patriots', team_abbrs: 'NE' },
    NYJ: { team_full: 'New York Jets', team_abbrs: 'NYJ' },
    BAL: { team_full: 'Baltimore Ravens', team_abbrs: 'BAL' },
    CIN: { team_full: 'Cincinnati Bengals', team_abbrs: 'CIN' },
    CLE: { team_full: 'Cleveland Browns', team_abbrs: 'CLE' },
    PIT: { team_full: 'Pittsburgh Steelers', team_abbrs: 'PIT' },
    HOU: { team_full: 'Houston Texans', team_abbrs: 'HOU' },
    IND: { team_full: 'Indianapolis Colts', team_abbrs: 'IND' },
    JAX: { team_full: 'Jacksonville Jaguars', team_abbrs: 'JAX' },
    JAC: { team_full: 'Jacksonville Jaguars', team_abbrs: 'JAX' },
    DEN: { team_full: 'Denver Broncos', team_abbrs: 'DEN' },
    KC: { team_full: 'Kansas City Chiefs', team_abbrs: 'KC' },
    KCC: { team_full: 'Kansas City Chiefs', team_abbrs: 'KC' },
    SF: { team_full: 'San Francisco 49ers', team_abbrs: 'SF' },
    SFO: { team_full: 'San Francisco 49ers', team_abbrs: 'SF' },
    SEA: { team_full: 'Seattle Seahawks', team_abbrs: 'SEA' },
};
/**
 * Get team information for a given PFR team code and season
 */
function getTeamInfo(pfrCode, season) {
    // Check if team has historical changes
    if (TEAM_HISTORY[pfrCode]) {
        // Find the appropriate season range
        const years = Object.keys(TEAM_HISTORY[pfrCode])
            .map(Number)
            .sort((a, b) => a - b);
        for (let i = years.length - 1; i >= 0; i--) {
            if (season >= years[i]) {
                return TEAM_HISTORY[pfrCode][years[i]];
            }
        }
    }
    // Check static teams
    if (STATIC_TEAMS[pfrCode]) {
        return STATIC_TEAMS[pfrCode];
    }
    // Fallback for unknown teams
    logger.warn(`Unknown team code: ${pfrCode} for season ${season}`, { pfrCode, season });
    return {
        team_full: `Unknown Team (${pfrCode})`,
        team_abbrs: pfrCode,
    };
}
/**
 * Handle multi-team seasons (2TM, 3TM, etc.)
 */
function getMultiTeamInfo() {
    return {
        team_full: 'Multiple Teams',
        team_abbrs: 'MULT',
    };
}
/**
 * Normalize team code variations
 */
function normalizeTeamCode(code) {
    const normalizedMap = {
        NO: 'NOR',
        TB: 'TBB',
        GB: 'GBP',
        NE: 'NEP',
        SF: 'SFO',
        KC: 'KCC',
        JAC: 'JAX',
        WSH: 'WAS',
    };
    return normalizedMap[code] || code;
}
//# sourceMappingURL=team_map.js.map