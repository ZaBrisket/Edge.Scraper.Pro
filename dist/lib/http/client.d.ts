interface FetchOptions extends RequestInit {
    correlationId?: string;
    retries?: number;
    timeout?: number;
}
export declare function fetchWithPolicy(input: string | URL | Request, opts?: FetchOptions): Promise<Response>;
export {};
//# sourceMappingURL=client.d.ts.map