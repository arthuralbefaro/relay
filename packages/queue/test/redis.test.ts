import { describe, expect, it } from 'vitest';
import { redisConnection } from '../src/index';

describe('redisConnection', () => {
  it('lê host, porta e banco', () => {
    expect(redisConnection('redis://localhost:6380/2')).toEqual({ host: 'localhost', port: 6380, db: 2 });
  });

  it('usa porta 6379 e banco 0 por padrão', () => {
    expect(redisConnection('redis://cache')).toEqual({ host: 'cache', port: 6379, db: 0 });
  });

  it('decodifica usuário e senha e liga TLS em rediss', () => {
    expect(redisConnection('rediss://user:p%40ss@host:1/0')).toEqual({
      host: 'host',
      port: 1,
      db: 0,
      username: 'user',
      password: 'p@ss',
      tls: {},
    });
  });

  it('recusa protocolo que não é redis', () => {
    expect(() => redisConnection('http://localhost')).toThrow('redis://');
  });
});