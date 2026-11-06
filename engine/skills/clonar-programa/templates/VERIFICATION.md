# Verificação de paridade — {{NAME}}

## Ambiente

- Versão do clone:
- Versão do alvo congelada:
- Data:
- Navegador/SO:
- Dados de teste:

## Limiares (defina antes de testar)

- Screenshot diff: até ___ % de pixels diferentes por tela, com revisão humana
- Desempenho: ___ (ex.: abertura até 20 % acima do alvo)
- Acessibilidade: ___ (ex.: todo fluxo P0 operável só com teclado)

## Testes

| ID | Tipo | Descrição | Resultado | Evidência |
|---|---|---|---|---|
| T-01 | E2E | | passou / falhou / não testado | |
| T-02 | contrato | | | |
| T-03 | visual | | | |
| T-04 | acessibilidade | | | |
| T-05 | desempenho | | | |

## Paridade por funcionalidade

| Feature | Status | Observação |
|---|---|---|
| F-01 | igual / parcial / ausente / não testado | |

## Comparação automática

```bash
node scripts/compare-behavior.mjs --expected alvo.json --actual clone.json \
  --ignore <campos que mudam sozinhos> --out 05-verification/diff.json
```

Saída 0 = igual · 1 = divergência · 2 = erro (JSON inválido ou nada a comparar).

| Campo ignorado | Por quê |
|---|---|
| | |

Ignorar campo é dívida visível: registre aqui o que e por quê.

## Diferenças conhecidas

-

## Falhas e bloqueios

-

## Decisão

- [ ] pronto para entregar
- [ ] pronto com ressalvas
- [ ] não está pronto

Data:
