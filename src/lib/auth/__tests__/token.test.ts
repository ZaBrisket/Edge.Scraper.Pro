import { extractBearerToken, requireAuth } from '../token';
import { AuthService } from '../index';

jest.mock('../index', () => ({
  AuthService: {
    verifyToken: jest.fn()
  }
}));

describe('extractBearerToken', () => {
  it('should extract token from Authorization header', () => {
    const headers = {
      authorization: 'Bearer test-token-123'
    };
    
    expect(extractBearerToken(headers)).toBe('test-token-123');
  });

  it('should extract token from Authorization header (uppercase)', () => {
    const headers = {
      Authorization: 'Bearer test-token-456'
    };
    
    expect(extractBearerToken(headers)).toBe('test-token-456');
  });

  it('should extract token from cookie', () => {
    const headers = {
      cookie: 'session=abc; esp_token=cookie-token-789; other=xyz'
    };
    
    expect(extractBearerToken(headers)).toBe('cookie-token-789');
  });

  it('should extract URL-encoded token from cookie', () => {
    const headers = {
      cookie: 'esp_token=token%20with%20spaces'
    };
    
    expect(extractBearerToken(headers)).toBe('token with spaces');
  });

  it('should prefer Authorization header over cookie', () => {
    const headers = {
      authorization: 'Bearer header-token',
      cookie: 'esp_token=cookie-token'
    };
    
    expect(extractBearerToken(headers)).toBe('header-token');
  });

  it('should return null when no token is found', () => {
    expect(extractBearerToken({})).toBeNull();
    expect(extractBearerToken({ cookie: 'session=abc' })).toBeNull();
    expect(extractBearerToken({ authorization: 'Basic abc123' })).toBeNull();
  });
});

describe('requireAuth', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return dev:true in development mode', () => {
    process.env.NETLIFY_DEV = 'true';
    
    const result = requireAuth({});
    expect(result).toEqual({ dev: true });
    expect(AuthService.verifyToken).not.toHaveBeenCalled();
  });

  it('should throw error when no token is provided', () => {
    delete process.env.NETLIFY_DEV;
    
    expect(() => requireAuth({})).toThrow('Authorization token required');
  });

  it('should verify and return token payload', () => {
    delete process.env.NETLIFY_DEV;
    const mockPayload = { userId: '123', permissions: ['read'] };
    (AuthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
    
    const headers = {
      authorization: 'Bearer valid-token'
    };
    
    const result = requireAuth(headers);
    expect(result).toBe(mockPayload);
    expect(AuthService.verifyToken).toHaveBeenCalledWith('valid-token');
  });

  it('should handle token from cookie', () => {
    delete process.env.NETLIFY_DEV;
    const mockPayload = { userId: '456', permissions: ['write'] };
    (AuthService.verifyToken as jest.Mock).mockReturnValue(mockPayload);
    
    const headers = {
      cookie: 'esp_token=cookie-token'
    };
    
    const result = requireAuth(headers);
    expect(result).toBe(mockPayload);
    expect(AuthService.verifyToken).toHaveBeenCalledWith('cookie-token');
  });
});