# Checklist de homologação do WhatsApp

Este documento é um roteiro manual, não evidência de homologação real. O ambiente
de desenvolvimento não possui credenciais UazapiGO nem número WhatsApp Business,
portanto nenhum envio ou conexão real foi executado aqui.

Antes de começar, confirme que as migrations foram aplicadas, as nove variáveis
WhatsApp estão configuradas conforme `DEPLOY.md`, `PUBLIC_API_URL` é alcançável
por HTTPS e o número é um WhatsApp Business dedicado. Use somente contatos que
consentiram em receber mensagens e comece com um grupo pequeno.

## Execução manual

- [ ] **QR:** criar a instância, abrir a tela de conexão, ler o QR com o número
  dedicado e confirmar que o status apresenta conectado e o telefone correto.
- [ ] **Test:** enviar uma mensagem de teste para um aparelho controlado; validar
  texto, personalização, mídia e ausência do rodapé de opt-out em categoria
  utilitária quando aplicável.
- [ ] **Schedule:** criar uma campanha pequena para o futuro, revisar público e
  consentimento, editar conteúdo, reagendar e confirmar horário final em UTC/local.
- [ ] **Webhook receive:** receber entrega, leitura e resposta; repetir o mesmo
  evento e confirmar idempotência. Responder `SAIR` e confirmar supressão sem
  duplicidade e cancelamento apenas de destinatários ainda pendentes/na fila.
- [ ] **Pause:** pausar uma campanha ativa e confirmar estado local e pasta remota
  interrompidos.
- [ ] **Resume:** retomar a campanha pausada e confirmar continuidade sem recriar
  ou duplicar destinatários.
- [ ] **Cancel:** cancelar uma campanha não terminal e confirmar que destinatários
  pendentes/na fila ficam cancelados e que a campanha não reabre ao sincronizar.
- [ ] **Retry failed:** provocar ou selecionar falhas controladas, usar “tentar
  falhos novamente” e confirmar uma nova campanha de auditoria contendo somente
  os destinatários falhos, sem alterar a campanha original.

## Critérios de encerramento

- Nenhum token administrativo, token de instância, chave de criptografia ou
  segredo de webhook aparece em respostas, mensagens de erro ou logs.
- O número dedicado recebe o teste e a campanha pequena sem duplicações; entrega,
  leitura, resposta e opt-out aparecem nas métricas.
- Líder regional e verificadora não acessam o módulo; dados de outra instância não
  aparecem em listas, detalhes, mídias ou campanhas.
- Não existem automações ou disparos espontâneos. Toda campanha ou agendamento foi
  iniciado explicitamente pela coordenação durante este checklist.

Registre data, ambiente, número mascarado, operador, campanhas usadas e eventuais
incidentes fora deste repositório. Só marque homologado depois da execução real
com credenciais e número aprovados.
