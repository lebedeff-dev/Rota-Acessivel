# RotaAcessível (Front-end Web)

Versão web do protótipo **RotaAcessível**, fiel ao design original (HTML + CSS +
JavaScript com mapa Leaflet), reconstruída num padrão profissional, limpo,
responsivo e acessível.

O usuário escolhe um **tipo de apoio** (visual, sonoro ou padrão), visualiza a
rota **UCB → Estação Taguatinga Sul** num mapa interativo, acompanha a viagem em
tempo real com barra de progresso fluida, recebe um **alerta de aproximação
adaptado ao apoio** e registra feedback.

> Dados 100% simulados. Nenhuma informação pessoal é coletada (LGPD).

## Estrutura

```
05-rotaacessivel-web/
├── index.html    # marcação semântica, acessível (ARIA, landmarks, stepper)
├── style.css     # design system claro/escuro, responsivo, foco visível
├── app.js        # estado, navegação, Leaflet, simulação, áudio, feedback
└── server.js     # servidor estático opcional (Node, sem dependências)
```

O `app.js` é organizado em módulos comentados por responsabilidade:
`Dados`, `Estado`, `Audio`, `MapaRota`, `Simulacao`, `Alerta`, `Etapas` e `UI`.

## Como abrir e testar

Precisa de um servidor local (o mapa e a Web Speech API funcionam melhor via
`http://`). Escolha **uma** das opções, a partir desta pasta.

**Opção A — Node (incluído, sem instalar nada):**

```bash
node server.js
```

Depois abra `http://localhost:3000` no navegador.

**Opção B — npx serve:**

```bash
npx serve -l 3000
```

**Opção C — abrir direto:** dê duplo clique em `index.html`. Funciona, mas alguns
navegadores restringem a leitura em voz alta em `file://`; prefira A ou B.

## O que testar

1. **Início** → botão “Começar” e “Ouvir apresentação” (voz do navegador).
2. **Apoio** → escolha visual, sonoro ou padrão. No padrão aparece um
   interruptor de áudio opcional.
3. **Rota** → mapa Leaflet com origem, destino, paradas e traçado; controles
   de centralizar e recarregar.
4. **Viagem** → barra de progresso fluida, ônibus se movendo no mapa, tempo
   restante, pausar/reiniciar.
5. **Alerta** → aos ~70% surge o alerta de aproximação, com ênfase forte no
   apoio visual e leitura em voz alta no apoio sonoro.
6. **Chegada** e **Feedback** → avaliação (Sim/Parcialmente/Não) + comentário.

## Acessibilidade (WCAG)

- Marcação semântica com landmarks (`header`, `main`, `footer`) e títulos.
- Link “Saltar para o conteúdo” e foco sempre visível.
- Região `aria-live` que anuncia mudanças (viagem iniciada, alerta, feedback).
- Alerta com `role="alert"` e `aria-live="assertive"`.
- Barra de progresso com `role="progressbar"` e `aria-valuenow`.
- Seleção de apoio como `radiogroup` navegável por teclado.
- Contraste adequado e suporte a tema escuro e a `prefers-reduced-motion`.
- Leitura em voz alta real via Web Speech API, com botão “Parar áudio”.

## Detalhes técnicos

- **Mapa:** Leaflet 1.9.4 + OpenStreetMap (CDN, com Subresource Integrity).
- **Simulação:** baseada em tempo real decorrido (`setInterval`), robusta a
  troca de aba; os 11 minutos são comprimidos para ~22 s de demonstração,
  enquanto o cronômetro exibe a contagem regressiva “real”.
- **Sem framework e sem build:** basta um servidor estático.
