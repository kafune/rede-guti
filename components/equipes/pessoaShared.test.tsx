import { describe, expect, it } from 'vitest';
import {
  buildPessoaCadastroLink,
  buildWhatsappUrl,
  cadastroWhatsappMessage,
  parsePessoaCadastroHash,
  pessoaParam
} from './pessoaShared';

describe('buildWhatsappUrl', () => {
  it('prefixes the country code for an 11-digit mobile with DDD', () => {
    expect(buildWhatsappUrl('11974938712')).toBe('https://wa.me/5511974938712');
  });

  it('accepts free formatting with punctuation', () => {
    expect(buildWhatsappUrl('(11) 97493-8712')).toBe('https://wa.me/5511974938712');
  });

  it('keeps a number that already carries the 55 country code', () => {
    expect(buildWhatsappUrl('5511974938712')).toBe('https://wa.me/5511974938712');
  });

  it('supports a 10-digit landline with DDD', () => {
    expect(buildWhatsappUrl('1132218000')).toBe('https://wa.me/551132218000');
  });

  it('does not strip a DDD 55 mobile as if it were a country code', () => {
    // 55 (RS) + 9 dígitos = 11 dígitos nacionais; não deve virar 559... quebrado.
    expect(buildWhatsappUrl('55991234567')).toBe('https://wa.me/5555991234567');
  });

  it('appends an URL-encoded text when provided', () => {
    expect(buildWhatsappUrl('11974938712', 'Olá! Tudo bem?')).toBe(
      'https://wa.me/5511974938712?text=Ol%C3%A1!%20Tudo%20bem%3F'
    );
  });

  it('returns null for a phone that is too short to be valid', () => {
    expect(buildWhatsappUrl('99999')).toBeNull();
    expect(buildWhatsappUrl('')).toBeNull();
  });
});

describe('pessoaParam', () => {
  it('labels the driver as "motorista"', () => {
    expect(pessoaParam('MOTORISTA')).toBe('motorista');
  });

  it('labels each supporter by slot position', () => {
    expect(pessoaParam('APOIADOR', 0)).toBe('a0');
    expect(pessoaParam('APOIADOR', 3)).toBe('a3');
  });

  it('falls back to slot 0 when the order is missing', () => {
    expect(pessoaParam('APOIADOR')).toBe('a0');
    expect(pessoaParam('APOIADOR', null)).toBe('a0');
  });
});

describe('buildPessoaCadastroLink / parsePessoaCadastroHash', () => {
  it('builds a hash link that round-trips through the parser', () => {
    const link = buildPessoaCadastroLink('equipe-123', 'a2');
    expect(link).toContain('#/pessoa/cadastro?equipe=equipe-123&p=a2');

    const hash = link.slice(link.indexOf('#'));
    expect(parsePessoaCadastroHash(hash)).toEqual({ equipeId: 'equipe-123', pessoa: 'a2' });
  });

  it('returns empty fields for a hash without params', () => {
    expect(parsePessoaCadastroHash('#/pessoa/cadastro')).toEqual({ equipeId: '', pessoa: '' });
  });
});

describe('cadastroWhatsappMessage', () => {
  it('includes the person name, team name and the link', () => {
    const msg = cadastroWhatsappMessage('Wellington', 'Equipe Wellington', 'https://x/#/pessoa/cadastro?equipe=1&p=motorista');
    expect(msg).toContain('Wellington');
    expect(msg).toContain('Equipe Wellington');
    expect(msg).toContain('https://x/#/pessoa/cadastro?equipe=1&p=motorista');
  });
});
