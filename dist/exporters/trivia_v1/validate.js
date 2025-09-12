"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTriviaDataset = validateTriviaDataset;
exports.validateRequiredFields = validateRequiredFields;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../../lib/logger");
const logger = (0, logger_1.createLogger)('trivia-validator');
// Schema paths
const SCHEMA_DIR = path.join(process.cwd(), 'schemas');
const DATASET_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.dataset.schema.json');
const PLAYER_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.player.schema.json');
const QB_SEASON_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.qb_season.schema.json');
const RB_SEASON_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.rb_season.schema.json');
const WR_SEASON_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.wr_season.schema.json');
const TE_SEASON_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.te_season.schema.json');
const ELIGIBILITY_SCHEMA_PATH = path.join(SCHEMA_DIR, 'trivia_v1.eligibility.schema.json');
/**
 * Create and configure AJV validator
 */
function createValidator() {
    const ajv = new ajv_1.default({
        allErrors: true,
        verbose: true,
        strict: true,
    });
    (0, ajv_formats_1.default)(ajv);
    // Load all schemas
    const schemas = [
        { path: PLAYER_SCHEMA_PATH, id: 'trivia_v1.player.schema.json' },
        { path: QB_SEASON_SCHEMA_PATH, id: 'trivia_v1.qb_season.schema.json' },
        { path: RB_SEASON_SCHEMA_PATH, id: 'trivia_v1.rb_season.schema.json' },
        { path: WR_SEASON_SCHEMA_PATH, id: 'trivia_v1.wr_season.schema.json' },
        { path: TE_SEASON_SCHEMA_PATH, id: 'trivia_v1.te_season.schema.json' },
        { path: ELIGIBILITY_SCHEMA_PATH, id: 'trivia_v1.eligibility.schema.json' },
        { path: DATASET_SCHEMA_PATH, id: 'trivia_v1.dataset.schema.json' },
    ];
    for (const { path: schemaPath, id } of schemas) {
        try {
            const schemaContent = fs.readFileSync(schemaPath, 'utf8');
            const schema = JSON.parse(schemaContent);
            ajv.addSchema(schema, id);
        }
        catch (error) {
            throw new Error(`Failed to load schema ${id}: ${error}`);
        }
    }
    return ajv;
}
/**
 * Validate a trivia dataset against the schema
 */
function validateTriviaDataset(data, options = {}) {
    const { strict = false, verbose = false } = options;
    const result = {
        valid: true,
        errors: [],
        warnings: [],
    };
    try {
        const ajv = createValidator();
        const validate = ajv.getSchema('trivia_v1.dataset.schema.json');
        if (!validate) {
            throw new Error('Dataset schema not found');
        }
        const isValid = validate(data);
        if (!isValid && validate.errors) {
            result.valid = false;
            result.errors = validate.errors.map(error => {
                const path = error.instancePath || 'root';
                const message = error.message || 'Unknown error';
                return `${path}: ${message}`;
            });
        }
        // Additional semantic validations
        if (data && typeof data === 'object') {
            const semanticErrors = performSemanticValidations(data);
            result.errors.push(...semanticErrors);
            if (semanticErrors.length > 0) {
                result.valid = false;
            }
        }
        if (verbose && result.errors.length > 0) {
            logger.error('Validation errors:', { errors: result.errors });
        }
    }
    catch (error) {
        result.valid = false;
        result.errors.push(`Validation failed: ${error}`);
    }
    return result;
}
/**
 * Perform semantic validations beyond JSON schema
 */
function performSemanticValidations(data) {
    const errors = [];
    if (!data.players || !Array.isArray(data.players)) {
        errors.push('Missing or invalid players array');
        return errors;
    }
    const playerIds = new Set();
    // Check for unique player IDs
    for (const player of data.players) {
        if (playerIds.has(player.player_id)) {
            errors.push(`Duplicate player_id: ${player.player_id}`);
        }
        playerIds.add(player.player_id);
    }
    // Validate season arrays
    const seasonArrays = ['qb_seasons', 'rb_seasons', 'wr_seasons', 'te_seasons'];
    for (const arrayName of seasonArrays) {
        if (data[arrayName] && Array.isArray(data[arrayName])) {
            for (const season of data[arrayName]) {
                // Check that player_id exists in players
                if (!playerIds.has(season.player_id)) {
                    errors.push(`Season row references non-existent player_id: ${season.player_id}`);
                }
                // Check season range
                if (season.season < 1997 || season.season > 2024) {
                    errors.push(`Season ${season.season} outside valid range [1997, 2024]`);
                }
                // Check for summary rows
                if (typeof season.Season === 'string' &&
                    (season.Season.includes('Career') ||
                        season.Season.includes('Avg') ||
                        season.Season.includes('Yrs') ||
                        season.Season.includes('TM'))) {
                    errors.push(`Found summary row in ${arrayName}: ${season.Season}`);
                }
                // Check numeric fields are actually numbers
                const numericFields = ['G', 'GS', 'Age'];
                for (const field of numericFields) {
                    if (season[field] !== undefined &&
                        (typeof season[field] !== 'number' || isNaN(season[field]))) {
                        errors.push(`Non-numeric value in ${arrayName}.${field}: ${season[field]}`);
                    }
                }
            }
        }
    }
    // Check eligibility array
    if (data.eligibility && Array.isArray(data.eligibility)) {
        for (const elig of data.eligibility) {
            if (!playerIds.has(elig.player_id)) {
                errors.push(`Eligibility row references non-existent player_id: ${elig.player_id}`);
            }
        }
    }
    return errors;
}
/**
 * Validate that all required fields are present and correctly typed
 */
function validateRequiredFields(data) {
    const result = {
        valid: true,
        errors: [],
        warnings: [],
    };
    const requiredTopLevel = [
        'schema',
        'players',
        'qb_seasons',
        'rb_seasons',
        'wr_seasons',
        'te_seasons',
        'eligibility',
        'daily_picks',
        'generated_at',
    ];
    for (const field of requiredTopLevel) {
        if (!(field in data)) {
            result.errors.push(`Missing required field: ${field}`);
            result.valid = false;
        }
    }
    if (data.schema) {
        if (data.schema.name !== 'trivia_v1') {
            result.errors.push(`Invalid schema name: expected 'trivia_v1', got '${data.schema.name}'`);
            result.valid = false;
        }
    }
    return result;
}
//# sourceMappingURL=validate.js.map