// Testes da lógica do checkout (node --test). Cobre o contrato de FEATURES.md F3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidName, isValidEmail, isValidCpf, isValidPhone, isEmailRegistered,
  maskCpf, maskPhone, normalizeCpf, validateStep1, findCoupon, calcTotals,
  formatBRL, formatCountdown, PRICE_CENTS,
} from '../04-build/site/assets/js/logic.js';

test('nome: exige nome + sobrenome', () => {
  assert.equal(isValidName('Maria Silva'), true);
  assert.equal(isValidName('Maria'), false);
  assert.equal(isValidName('  A B'), false);
});

test('email: formato e duplicado (comportamento observado no checkout)', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('a@b'), false);
  assert.equal(isEmailRegistered('TEST@test.com'), true);
  assert.equal(isEmailRegistered('novo@x.com'), false);
});

test('CPF: algoritmo dos dígitos verificadores', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-26'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
});

test('telefone BR: DDD + 8/9 dígitos', () => {
  assert.equal(isValidPhone('(49) 99999-1234'), true);
  assert.equal(isValidPhone('49 3322 1234'), true);
  assert.equal(isValidPhone('10 99999-1234'), false);
  assert.equal(isValidPhone('49 9999'), false);
});

test('máscaras são estáveis e idempotentes', () => {
  assert.equal(maskCpf('52998224725'), '529.982.247-25');
  assert.equal(maskCpf('529.982.247-25'), '529.982.247-25');
  assert.equal(maskPhone('4999991234'), '(49) 9999-1234');
  assert.equal(maskPhone('49999991234'), '(49) 99999-1234');
});

test('validateStep1 junta erros por campo', () => {
  const bad = validateStep1({ name: 'X', email: 'test@test.com', cpf: '0', phone: '1' });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['cpf', 'email', 'name', 'phone']);
  assert.match(bad.errors.email, /já cadastrado/);
  const good = validateStep1({ name: 'Ana Souza', email: 'ana@x.com', cpf: '52998224725', phone: '49999991234' });
  assert.equal(good.ok, true);
});

test('cupom: válido, inválido, expirado, vazio', () => {
  assert.equal(findCoupon(' clube5 ').ok, true);
  assert.equal(findCoupon('NAO').reason, 'invalid');
  assert.equal(findCoupon('EXPIROU').reason, 'expired');
  assert.equal(findCoupon('').reason, 'empty');
});

test('totais: R$27, -5% Pix, cupom antes do Pix (contrato próprio)', () => {
  assert.equal(PRICE_CENTS, 2700);
  assert.equal(calcTotals({ method: 'pix' }).total, 2565);
  assert.equal(calcTotals({ method: 'card' }).total, 2700);
  assert.equal(calcTotals({ method: 'pix', coupon: findCoupon('CLUBE5') }).total, 2090); // 27-5=22; -5% = 20,90
  assert.equal(calcTotals({ method: 'boleto' }).pixDiscount, 0);
});

test('formatos BRL e countdown', () => {
  assert.equal(formatBRL(2565), 'R$ 25,65');
  assert.equal(formatBRL(2700), 'R$ 27,00');
  assert.equal(formatCountdown(420), '00:07:00');
  assert.equal(formatCountdown(0), '00:00:00');
});
