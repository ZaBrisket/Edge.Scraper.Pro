import * as fs from 'fs';
import * as crypto from 'crypto';
import { getTeamInfo, getMultiTeamInfo } from '../team_map';
import { validateTriviaDataset, ValidationOptions } from './validate';
import { createLogger } from '../../lib/logger';

const logger = createLogger('trivia-exporter');

// Type definitions
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
  [key: string]: any; // Allow additional stats fields
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
  // Optional rushing stats
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
  // Optional rushing stats
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

const DEFAULT_OPTIONS: Required<ExporterOptions> = {
  seasonMin: 1997,
  seasonMax: 2024,
  positions: ['QB', 'RB', 'WR', 'TE'],
  requireGMin: 1,
  dropSummaryRows: true,
  strict: false,
  verbose: false,
};

/**
 * Create a unique slug from a player name
 */
export function slugifyPlayerName(name: string, existingIds: Set<string>): string {
  // Basic slugification: lowercase, remove special chars, replace spaces with underscores
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');

  // Ensure uniqueness
  if (!existingIds.has(slug)) {
    return slug;
  }

  // Add suffix for uniqueness
  let counter = 1;
  let uniqueSlug = `${slug}_${counter}`;
  while (existingIds.has(uniqueSlug)) {
    counter++;
    uniqueSlug = `${slug}_${counter}`;
  }

  return uniqueSlug;
}

/**
 * Parse birthdate from PFR format
 */
function parseBirthdate(birthDate?: string, birthPlace?: string): string | null {
  if (!birthDate && !birthPlace) return null;

  // PFR sometimes puts year in birthPlace and month/day in birthDate
  const year = birthPlace && /^\d{4}$/.test(birthPlace) ? birthPlace : null;
  const monthDay = birthDate;

  if (year && monthDay) {
    try {
      const date = new Date(`${monthDay}, ${year}`);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return null;
}

/**
 * Determine player's primary position from season data
 */
function determinePlayerPosition(seasons: RawSeasonRow[]): string | null {
  const positionCounts: Record<string, number> = {};

  for (const season of seasons) {
    if (season.Pos && typeof season.Pos === 'string') {
      const pos = season.Pos.trim();
      if (pos && pos !== '') {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      }
    }
  }

  // Find the most common position
  let maxCount = 0;
  let primaryPos: string | null = null;

  for (const [pos, count] of Object.entries(positionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      primaryPos = pos;
    }
  }

  return primaryPos;
}

/**
 * Check if a season row is a summary/aggregate row
 */
function isSummaryRow(season: RawSeasonRow): boolean {
  if (typeof season.Season === 'string') {
    const seasonStr = season.Season.toLowerCase();
    return (
      seasonStr.includes('career') ||
      seasonStr.includes('avg') ||
      seasonStr.includes('yrs') ||
      seasonStr.includes('2tm') ||
      seasonStr.includes('3tm') ||
      seasonStr.includes('4tm')
    );
  }
  return false;
}

/**
 * Coerce a value to number, handling PFR formatting
 */
function coerceToNumber(value: any): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  if (typeof value === 'string') {
    // Remove commas and percentage signs
    const cleaned = value.replace(/[,%]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  return 0;
}

/**
 * Parse and normalize awards string
 */
function parseAwards(awardsStr?: string): string[] {
  if (!awardsStr || typeof awardsStr !== 'string') {
    return [];
  }

  const awards: string[] = [];
  const str = awardsStr.toLowerCase();

  // Map common award patterns
  const awardPatterns = [
    { pattern: /pro bowl/i, award: 'Pro Bowl' },
    { pattern: /all-pro/i, award: '1st Team All-Pro' },
    { pattern: /mvp/i, award: 'MVP' },
    { pattern: /opoy/i, award: 'OPOY' },
    { pattern: /dpoy/i, award: 'DPOY' },
    { pattern: /roy/i, award: 'ROY' },
    { pattern: /comeback/i, award: 'Comeback Player' },
  ];

  for (const { pattern, award } of awardPatterns) {
    if (pattern.test(str)) {
      awards.push(award);
    }
  }

  return [...new Set(awards)]; // Remove duplicates
}

/**
 * Process a single season row
 */
function processSeasonRow(
  rawSeason: RawSeasonRow,
  playerId: string,
  playerPos: string,
  options: Required<ExporterOptions>
): SeasonRowBase | null {
  // Skip summary rows
  if (options.dropSummaryRows && isSummaryRow(rawSeason)) {
    return null;
  }

  // Validate season
  const season =
    typeof rawSeason.Season === 'number' ? rawSeason.Season : parseInt(String(rawSeason.Season));
  if (isNaN(season) || season < options.seasonMin || season > options.seasonMax) {
    return null;
  }

  // Check games played requirement
  const games = coerceToNumber(rawSeason.G);
  if (games < options.requireGMin) {
    return null;
  }

  // Get team info
  const teamCode = rawSeason.Team || '';
  const isMultiTeam = teamCode.includes('TM') || teamCode === '';
  const teamInfo = isMultiTeam ? getMultiTeamInfo() : getTeamInfo(teamCode, season);

  // Build base season row
  const baseRow: SeasonRowBase = {
    player_id: playerId,
    season,
    age: coerceToNumber(rawSeason.Age),
    team_full: teamInfo.team_full,
    team_abbrs: teamInfo.team_abbrs,
    pos: playerPos,
    G: games,
    GS: coerceToNumber(rawSeason.GS),
    Awards: parseAwards(rawSeason.Awards),
    multi_team: isMultiTeam,
  };

  return baseRow;
}

/**
 * Add position-specific stats to a season row
 */
function addPositionStats(
  baseRow: SeasonRowBase,
  rawSeason: RawSeasonRow
): QBSeasonRow | RBSeasonRow | WRSeasonRow | TESeasonRow {
  const pos = baseRow.pos as 'QB' | 'RB' | 'WR' | 'TE';

  switch (pos) {
    case 'QB':
      return {
        ...baseRow,
        pos: 'QB',
        Cmp: coerceToNumber(rawSeason.Cmp),
        Att: coerceToNumber(rawSeason.Att),
        CmpPct: coerceToNumber(rawSeason['Cmp%']),
        Yds: coerceToNumber(rawSeason.Yds),
        TD: coerceToNumber(rawSeason.TD),
        Int: coerceToNumber(rawSeason.Int),
        Rate: coerceToNumber(rawSeason.Rate),
        Sk: coerceToNumber(rawSeason.Sk),
        SkYds: coerceToNumber(rawSeason.SkYds),
        'Y/A': coerceToNumber(rawSeason['Y/A']),
        'AY/A': coerceToNumber(rawSeason['AY/A']),
        'Y/C': coerceToNumber(rawSeason['Y/C']),
        'Y/G': coerceToNumber(rawSeason['Y/G']),
        'NY/A': coerceToNumber(rawSeason['NY/A']),
        'ANY/A': coerceToNumber(rawSeason['ANY/A']),
        '4QC': coerceToNumber(rawSeason['4QC']),
        GWD: coerceToNumber(rawSeason.GWD),
      } as QBSeasonRow;

    case 'RB':
      return {
        ...baseRow,
        pos: 'RB',
        Att: coerceToNumber(rawSeason.Att),
        Yds: coerceToNumber(rawSeason.Yds),
        TD: coerceToNumber(rawSeason.TD),
        'Y/A': coerceToNumber(rawSeason['Y/A']),
        'Y/G': coerceToNumber(rawSeason['Y/G']),
        'A/G': coerceToNumber(rawSeason['A/G']),
        Tgt: coerceToNumber(rawSeason.Tgt),
        Rec: coerceToNumber(rawSeason.Rec),
        RecYds: coerceToNumber(rawSeason.RecYds),
        'Y/R': coerceToNumber(rawSeason['Y/R']),
        RecTD: coerceToNumber(rawSeason.RecTD),
        'R/G': coerceToNumber(rawSeason['R/G']),
        'RecY/G': coerceToNumber(rawSeason['RecY/G']),
        Touch: coerceToNumber(rawSeason.Touch),
        'Y/Tch': coerceToNumber(rawSeason['Y/Tch']),
        YScm: coerceToNumber(rawSeason.YScm),
        RRTD: coerceToNumber(rawSeason.RRTD),
        Fmb: coerceToNumber(rawSeason.Fmb),
      } as RBSeasonRow;

    case 'WR':
    case 'TE':
      return {
        ...baseRow,
        pos,
        Tgt: coerceToNumber(rawSeason.Tgt),
        Rec: coerceToNumber(rawSeason.Rec),
        RecYds: coerceToNumber(rawSeason.RecYds),
        'Y/R': coerceToNumber(rawSeason['Y/R']),
        RecTD: coerceToNumber(rawSeason.RecTD),
        'R/G': coerceToNumber(rawSeason['R/G']),
        'RecY/G': coerceToNumber(rawSeason['RecY/G']),
        Fmb: coerceToNumber(rawSeason.Fmb),
        // Optional rushing stats
        Att: rawSeason.Att ? coerceToNumber(rawSeason.Att) : undefined,
        Yds: rawSeason.Yds ? coerceToNumber(rawSeason.Yds) : undefined,
        TD: rawSeason.TD ? coerceToNumber(rawSeason.TD) : undefined,
      } as WRSeasonRow | TESeasonRow;

    default:
      throw new Error(`Unknown position: ${pos}`);
  }
}

/**
 * Build trivia dataset from raw PFR data
 */
export async function buildTriviaDataset(
  rawDataPath: string,
  options: ExporterOptions = {}
): Promise<TriviaDataset> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.verbose) {
    logger.info('Loading raw data from:', { rawDataPath });
  }

  // Load and validate input file
  if (!fs.existsSync(rawDataPath)) {
    throw new Error(`Input file not found: ${rawDataPath}`);
  }

  const rawDataContent = fs.readFileSync(rawDataPath, 'utf8');
  const rawData = JSON.parse(rawDataContent);

  if (!rawData.players || !Array.isArray(rawData.players)) {
    throw new Error('Invalid input data: missing players array');
  }

  const existingPlayerIds = new Set<string>();
  const players: TriviaPlayer[] = [];
  const qbSeasons: QBSeasonRow[] = [];
  const rbSeasons: RBSeasonRow[] = [];
  const wrSeasons: WRSeasonRow[] = [];
  const teSeasons: TESeasonRow[] = [];
  const eligibility: EligibilityRow[] = [];

  if (opts.verbose) {
    logger.info(`Processing ${rawData.players.length} players...`, {
      playerCount: rawData.players.length,
    });
  }

  for (const rawPlayer of rawData.players) {
    try {
      // Determine player position
      const primaryPos = determinePlayerPosition(rawPlayer.statistics.seasons);
      if (!primaryPos || !opts.positions.includes(primaryPos)) {
        if (opts.verbose) {
          logger.debug(
            `Skipping player ${rawPlayer.profile.name}: position ${primaryPos} not in allowed positions`,
            { playerName: rawPlayer.profile.name, position: primaryPos }
          );
        }
        continue;
      }

      // Create player ID
      const playerId = slugifyPlayerName(rawPlayer.profile.name, existingPlayerIds);
      existingPlayerIds.add(playerId);

      // Create player record
      const player: TriviaPlayer = {
        player_id: playerId,
        full_name: rawPlayer.profile.name,
        pos: primaryPos as 'QB' | 'RB' | 'WR' | 'TE',
        college: rawPlayer.profile.personal?.college || null,
        birthdate: parseBirthdate(
          rawPlayer.profile.personal?.birthDate,
          rawPlayer.profile.personal?.birthPlace
        ),
        fun_fact: null,
      };

      // Process seasons
      const validSeasons: (QBSeasonRow | RBSeasonRow | WRSeasonRow | TESeasonRow)[] = [];
      let seasonsWithGames = 0;
      let rookieYear = Infinity;

      for (const rawSeason of rawPlayer.statistics.seasons) {
        const baseRow = processSeasonRow(rawSeason, playerId, primaryPos, opts);
        if (!baseRow) continue;

        const seasonRow = addPositionStats(baseRow, rawSeason);
        validSeasons.push(seasonRow);

        if (seasonRow.G >= 1) {
          seasonsWithGames++;
        }

        if (seasonRow.season < rookieYear) {
          rookieYear = seasonRow.season;
        }
      }

      // Skip players with no valid seasons
      if (validSeasons.length === 0) {
        if (opts.verbose) {
          logger.debug(`Skipping player ${player.full_name}: no valid seasons`, {
            playerName: player.full_name,
          });
        }
        continue;
      }

      // Add player and seasons
      players.push(player);

      // Sort seasons by year and team
      validSeasons.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.team_full.localeCompare(b.team_full);
      });

      // Distribute to position arrays
      for (const season of validSeasons) {
        switch (season.pos) {
          case 'QB':
            qbSeasons.push(season as QBSeasonRow);
            break;
          case 'RB':
            rbSeasons.push(season as RBSeasonRow);
            break;
          case 'WR':
            wrSeasons.push(season as WRSeasonRow);
            break;
          case 'TE':
            teSeasons.push(season as TESeasonRow);
            break;
        }
      }

      // Add eligibility
      eligibility.push({
        player_id: playerId,
        rookie_year: rookieYear === Infinity ? opts.seasonMin : rookieYear,
        seasons_with_G_ge_1: seasonsWithGames,
        eligible_flag: true,
      });
    } catch (error) {
      if (opts.verbose) {
        logger.error(`Error processing player ${rawPlayer.profile.name}:`, {
          playerName: rawPlayer.profile.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      if (opts.strict) {
        throw error;
      }
    }
  }

  // Sort all arrays
  players.sort((a, b) => a.player_id.localeCompare(b.player_id));

  const sortSeasons = (a: any, b: any) => {
    if (a.player_id !== b.player_id) return a.player_id.localeCompare(b.player_id);
    if (a.season !== b.season) return a.season - b.season;
    return a.team_full.localeCompare(b.team_full);
  };

  qbSeasons.sort(sortSeasons);
  rbSeasons.sort(sortSeasons);
  wrSeasons.sort(sortSeasons);
  teSeasons.sort(sortSeasons);
  eligibility.sort((a, b) => a.player_id.localeCompare(b.player_id));

  const dataset: TriviaDataset = {
    schema: {
      name: 'trivia_v1',
      version: '1.0.0',
    },
    players,
    qb_seasons: qbSeasons,
    rb_seasons: rbSeasons,
    wr_seasons: wrSeasons,
    te_seasons: teSeasons,
    eligibility,
    daily_picks: {},
    generated_at: new Date().toISOString(),
  };

  if (opts.verbose) {
    logger.info(`Generated dataset with:`, {
      players: players.length,
      qbSeasons: qbSeasons.length,
      rbSeasons: rbSeasons.length,
      wrSeasons: wrSeasons.length,
      teSeasons: teSeasons.length,
    });
  }

  return dataset;
}

/**
 * Export trivia dataset to JSON file
 */
export async function exportTriviaDataset(
  rawDataPath: string,
  outputPath: string,
  options: ExporterOptions & { pretty?: boolean; validate?: boolean } = {}
): Promise<void> {
  const { pretty = false, validate = true, ...buildOptions } = options;

  const dataset = await buildTriviaDataset(rawDataPath, buildOptions);

  // Validate if requested
  if (validate) {
    const validationResult = validateTriviaDataset(dataset, {
      strict: buildOptions.strict,
      verbose: buildOptions.verbose,
    });

    if (!validationResult.valid) {
      throw new Error(`Dataset validation failed:\n${validationResult.errors.join('\n')}`);
    }

    if (buildOptions.verbose) {
      logger.info('Dataset validation passed');
    }
  }

  // Write output
  const jsonContent = pretty ? JSON.stringify(dataset, null, 2) : JSON.stringify(dataset);
  fs.writeFileSync(outputPath, jsonContent);

  if (buildOptions.verbose) {
    logger.info(`Dataset exported to: ${outputPath}`, { outputPath });
  }
}
