/* =========================================================================
   RotaAcessível — Lógica da aplicação (front-end)
   Sem frameworks. Módulos organizados por responsabilidade:
     Dados      -> rota simulada e constantes
     Estado     -> dados de sessão (apoio escolhido, viagem)
     Audio      -> audiodescrição via Web Speech API (RF-06/09/10/11)
     MapaRota   -> Leaflet: traçado, marcadores e marcador móvel
     Simulacao  -> progresso fluido da viagem (RF-17/18/19/20)
     Alerta     -> alerta de aproximação adaptado ao apoio (RF-21/22)
     Etapas     -> navegação entre as telas (stepper)
     UI         -> ligações de eventos
   Comentado e pronto para rodar em um servidor local simples.
   ========================================================================= */
(function () {
  'use strict';

  /* -------------------------------------------------------------- DADOS */
  // Coordenadas coerentes com o mapa Leaflet do protótipo original.
  const ROTA = {
    origem: 'Universidade Católica de Brasília',
    destino: 'Estação Taguatinga Sul',
    distanciaKm: 3.5,
    duracaoSeg: 660, // 11 minutos (tempo "real" exibido ao usuário)
    // [lat, lng, nome, kmAcumulado]
    pontos: [
      [-15.8656, -48.0319, 'Universidade Católica de Brasília (UCB)', 0.0],
      [-15.8590, -48.0360, 'Av. das Araçás', 0.9],
      [-15.8500, -48.0430, 'Pistão Sul', 1.9],
      [-15.8430, -48.0510, 'Taguatinga Shopping', 2.8],
      [-15.8402, -48.0561, 'Estação Taguatinga Sul (Metrô)', 3.5]
    ]
  };

  // A simulação é comprimida para uma demonstração ágil, mas o cronômetro
  // exibido conta o tempo "real" de 11:00 até 0:00.
  const DURACAO_ANIMACAO_MS = 22000;

  const APOIOS = {
    VISUAL: { rotulo: 'Apoio visual' },
    SONORO: { rotulo: 'Apoio sonoro' },
    PADRAO: { rotulo: 'Apoio padrão' }
  };

  /* -------------------------------------------------------------- ESTADO */
  const estado = {
    apoio: null,          // 'VISUAL' | 'SONORO' | 'PADRAO'
    audioOpcional: false, // Apoio padrão: áudio só se o usuário ativar
    etapa: 'inicio'
  };

  /* --------------------------------------------------------------- UTIL */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function anunciar(texto) {
    // Atualiza a região aria-live para leitores de tela.
    const el = $('#anunciador');
    if (el) { el.textContent = ''; requestAnimationFrame(() => (el.textContent = texto)); }
  }

  function formatarTempo(seg) {
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  /* --------------------------------------------------------------- AUDIO */
  // Audiodescrição real usando a Web Speech API quando disponível.
  const Audio = {
    suportado: 'speechSynthesis' in window,

    // Deve narrar? Apoio sonoro sempre; padrão só se o usuário ativou.
    deveNarrar() {
      if (estado.apoio === 'SONORO') return true;
      if (estado.apoio === 'PADRAO') return estado.audioOpcional;
      return false; // Apoio visual prioriza a tela
    },

    falar(texto, forcar) {
      if (!this.suportado || !texto) return;
      if (!forcar && !this.deveNarrar()) return;
      this.parar();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
      toggleBotaoParar(true);
    },

    parar() {
      if (this.suportado) window.speechSynthesis.cancel();
      toggleBotaoParar(false);
    }
  };

  function toggleBotaoParar(mostrar) {
    const btn = $('#btnPararAudioGlobal');
    if (btn) btn.hidden = !mostrar;
  }

  /* ------------------------------------------------------------ MAPA/ROTA */
  // Encapsula um mapa Leaflet: traçado da rota, marcadores e marcador móvel.
  function criarMapa(idElemento) {
    const linha = ROTA.pontos.map(p => [p[0], p[1]]);
    const map = L.map(idElemento, { scrollWheelZoom: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    // Traçado da rota
    L.polyline(linha, { color: '#1b4b91', weight: 6, opacity: .85 }).addTo(map);

    // Marcadores de origem e destino
    const iconeDiv = (txt, cor) => L.divIcon({
      className: 'marcador',
      html: `<div style="background:${cor};color:#fff;font-weight:700;
             padding:4px 8px;border-radius:8px;white-space:nowrap;
             box-shadow:0 2px 6px rgba(0,0,0,.35)">${txt}</div>`,
      iconAnchor: [0, 0]
    });
    L.marker(linha[0], { icon: iconeDiv('A · UCB', '#0e7c66') }).addTo(map)
      .bindPopup('<b>Origem</b><br>' + ROTA.origem);
    L.marker(linha[linha.length - 1], { icon: iconeDiv('B · Estação', '#b42318') }).addTo(map)
      .bindPopup('<b>Destino</b><br>' + ROTA.destino);

    // Marcador móvel (ônibus)
    const onibus = L.marker(linha[0], {
      icon: iconeDiv('🚌', '#0a2a5e'), zIndexOffset: 1000
    }).addTo(map);

    const bounds = L.latLngBounds(linha).pad(0.15);
    map.fitBounds(bounds);

    return {
      map,
      centralizar: () => map.fitBounds(bounds),
      // Reposiciona o ônibus conforme a fração percorrida (0..1).
      moverOnibus(frac) {
        onibus.setLatLng(interpolar(frac));
      },
      invalidar: () => setTimeout(() => map.invalidateSize(), 60)
    };
  }

  // Interpola a posição ao longo dos segmentos por km acumulado.
  function interpolar(frac) {
    const kmAlvo = Math.max(0, Math.min(1, frac)) * ROTA.distanciaKm;
    const p = ROTA.pontos;
    for (let i = 0; i < p.length - 1; i++) {
      const kmA = p[i][3], kmB = p[i + 1][3];
      if (kmAlvo <= kmB || i === p.length - 2) {
        const t = (kmB === kmA) ? 0 : (kmAlvo - kmA) / (kmB - kmA);
        const lat = p[i][0] + (p[i + 1][0] - p[i][0]) * t;
        const lng = p[i][1] + (p[i + 1][1] - p[i][1]) * t;
        return [lat, lng];
      }
    }
    return [p[0][0], p[0][1]];
  }

  function pontoAtualNome(frac) {
    const km = frac * ROTA.distanciaKm;
    let nome = ROTA.pontos[0][2];
    for (const pt of ROTA.pontos) if (pt[3] <= km + 1e-9) nome = pt[2];
    return nome;
  }

  let mapaRota = null;    // etapa 3
  let mapaViagem = null;  // etapa 4

  /* ----------------------------------------------------------- SIMULAÇÃO */
  const Simulacao = {
    timer: null,
    inicioMs: 0,
    ultimaPausaMs: 0,
    pausaAcumuladaMs: 0,
    fracao: 0,
    pausado: false,
    alertaEmitido: false,
    INTERVALO_MS: 50, // suave graças à transição CSS; continua em 2º plano

    iniciar() {
      this.parar();
      this.inicioMs = performance.now();
      this.ultimaPausaMs = 0;
      this.pausaAcumuladaMs = 0;
      this.fracao = 0;
      this.pausado = false;
      this.alertaEmitido = false;
      Alerta.esconder();
      $('#btnPausar').textContent = 'Pausar';
      this.render(0);
      // Temporizador baseado em tempo real decorrido (robusto a throttling).
      this.timer = setInterval(() => this.tick(), this.INTERVALO_MS);
      anunciar('Viagem iniciada.');
      Audio.falar('Viagem iniciada. Acompanhe o progresso até a Estação Taguatinga Sul.');
    },

    tick() {
      if (this.pausado) return;
      const decorrido = performance.now() - this.inicioMs - this.pausaAcumuladaMs;
      this.fracao = Math.min(decorrido / DURACAO_ANIMACAO_MS, 1);
      this.render(this.fracao);
      if (this.fracao >= 1) this.finalizar();
    },

    render(frac) {
      const pct = Math.round(frac * 100);
      const km = frac * ROTA.distanciaKm;
      const restante = Math.max(0, Math.round((1 - frac) * ROTA.duracaoSeg));

      $('#progressFill').style.width = pct + '%';
      $('#progressbar').setAttribute('aria-valuenow', String(pct));
      $('#pct').textContent = pct + '%';
      $('#kmPercorrido').textContent = km.toFixed(2).replace('.', ',') + ' km';
      $('#tempoRestante').textContent = formatarTempo(restante);
      $('#pontoAtual').textContent = pontoAtualNome(frac);

      atualizarStatus(frac);
      if (mapaViagem) mapaViagem.moverOnibus(frac);

      // Alerta de aproximação (a partir de 70%), emitido uma única vez.
      if (!this.alertaEmitido && frac >= 0.70 && frac < 1) {
        this.alertaEmitido = true;
        Alerta.emitir();
      }
    },

    alternarPausa() {
      if (!this.timer || this.fracao >= 1) return;
      this.pausado = !this.pausado;
      const btn = $('#btnPausar');
      if (this.pausado) {
        this.ultimaPausaMs = performance.now();
        btn.textContent = 'Retomar';
        anunciar('Viagem pausada.');
      } else {
        // Acumula o tempo pausado para não "adiantar" o trajeto.
        this.pausaAcumuladaMs += performance.now() - this.ultimaPausaMs;
        btn.textContent = 'Pausar';
        anunciar('Viagem retomada.');
      }
    },

    finalizar() {
      this.parar();
      this.render(1);
      anunciar('Você chegou à Estação Taguatinga Sul.');
      Audio.falar('Você chegou à Estação Taguatinga Sul. Prepare-se para desembarcar.');
      setTimeout(() => Etapas.ir('fim'), 900);
    },

    parar() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    },

    cancelar() { this.parar(); }
  };

  function atualizarStatus(frac) {
    const chip = $('#statusChip');
    let texto, estadoAttr;
    if (frac >= 1)          { texto = 'Chegada';            estadoAttr = 'chegada'; }
    else if (frac >= 0.95)  { texto = 'Chegando...';        estadoAttr = 'chegando'; }
    else if (frac >= 0.70)  { texto = 'Próximo da chegada'; estadoAttr = 'proximo'; }
    else                    { texto = 'Em trânsito';        estadoAttr = 'transito'; }
    chip.textContent = texto;
    chip.dataset.state = estadoAttr;
  }

  /* -------------------------------------------------------------- ALERTA */
  const Alerta = {
    emitir() {
      const box = $('#alerta');
      const titulo = $('#alertaTitulo');
      const texto = $('#alertaTexto');
      const msg = 'Você está se aproximando da Estação Taguatinga Sul. Prepare-se para desembarcar.';

      box.classList.remove('alerta--visual');
      if (estado.apoio === 'VISUAL') {
        // Ênfase visual forte (RF-05/RF-22).
        box.classList.add('alerta--visual');
        titulo.textContent = '⚠ ATENÇÃO — APROXIMANDO DO DESTINO';
      } else {
        titulo.textContent = 'Aproximando do destino';
      }
      texto.textContent = msg;
      box.hidden = false;

      anunciar('Alerta: ' + msg);
      // Apoio sonoro narra; padrão narra se o áudio estiver ativo.
      Audio.falar('Atenção. ' + msg, estado.apoio === 'SONORO');
    },
    esconder() {
      const box = $('#alerta');
      if (box) { box.hidden = true; box.classList.remove('alerta--visual'); }
    }
  };

  /* -------------------------------------------------------------- ETAPAS */
  const ORDEM = ['inicio', 'apoio', 'rota', 'viagem', 'fim', 'feedback'];

  const Etapas = {
    ir(nome) {
      estado.etapa = nome;

      // Alterna as seções.
      $$('.etapa').forEach(sec => {
        const ativa = sec.id === 'etapa-' + nome;
        sec.hidden = !ativa;
        sec.classList.toggle('is-visible', ativa);
      });

      // Atualiza o stepper (mapa fim/feedback -> índices próprios).
      const idx = ORDEM.indexOf(nome);
      $$('.stepper__item').forEach((li, i) => {
        li.classList.toggle('is-active', i === idx);
        li.classList.toggle('is-done', i < idx);
      });

      // Gatilhos específicos por etapa.
      if (nome === 'rota') this.aoEntrarRota();
      if (nome === 'viagem') this.aoEntrarViagem();
      if (nome !== 'viagem') Simulacao.cancelar();
      if (nome === 'inicio') this.reiniciarSessao();

      // Foco no título da etapa (acessibilidade).
      const alvo = $('#etapa-' + nome);
      if (alvo) { alvo.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    },

    aoEntrarRota() {
      $('#rotaApoioLabel').textContent = estado.apoio ? APOIOS[estado.apoio].rotulo : '—';
      if (!mapaRota) mapaRota = criarMapa('mapa');
      mapaRota.invalidar();
    },

    aoEntrarViagem() {
      if (!mapaViagem) mapaViagem = criarMapa('mapaViagem');
      mapaViagem.invalidar();
      mapaViagem.centralizar();
      Simulacao.iniciar();
    },

    reiniciarSessao() {
      Audio.parar();
      Alerta.esconder();
    }
  };

  /* ------------------------------------------------------------------ UI */
  function ligarEventos() {
    // Botões com data-goto navegam entre etapas.
    $$('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        const destino = btn.getAttribute('data-goto');
        if (destino === 'rota' && !estado.apoio) return; // trava sem apoio
        Etapas.ir(destino);
      });
    });

    // Seleção de tipo de apoio (radiogroup acessível).
    $$('.apoio-card').forEach(card => {
      card.addEventListener('click', () => selecionarApoio(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionarApoio(card); }
      });
    });

    // Áudio.
    $('#btnOuvirApresentacao').addEventListener('click', () => {
      Audio.falar('RotaAcessível ajuda você a planejar e acompanhar uma viagem no '
        + 'transporte público, com alertas adaptados ao apoio que você escolher.', true);
    });
    $('#btnOuvirApoios').addEventListener('click', () => {
      Audio.falar('Apoio visual: alertas destacados na tela. '
        + 'Apoio sonoro: leitura em voz alta. '
        + 'Apoio padrão: mapa e alertas básicos, com áudio opcional.', true);
    });
    $('#btnPararAudioGlobal').addEventListener('click', () => Audio.parar());

    // Interruptor de áudio opcional (Apoio padrão).
    $('#chkAudioOpcional').addEventListener('change', (e) => {
      estado.audioOpcional = e.target.checked;
      anunciar(e.target.checked ? 'Áudio opcional ativado.' : 'Áudio opcional desativado.');
      if (e.target.checked) {
        Audio.falar('Áudio opcional ativado.', true);
      } else {
        Audio.parar();
      }
    });

    // Rota / mapa.
    $('#btnCentralizar').addEventListener('click', () => mapaRota && mapaRota.centralizar());
    $('#btnRecarregar').addEventListener('click', () => {
      if (mapaRota) { mapaRota.invalidar(); mapaRota.centralizar(); anunciar('Mapa recarregado.'); }
    });
    $('#btnIniciarViagem').addEventListener('click', () => Etapas.ir('viagem'));

    // Simulação.
    $('#btnPausar').addEventListener('click', () => Simulacao.alternarPausa());
    $('#btnReiniciarViagem').addEventListener('click', () => Simulacao.iniciar());

    // Feedback.
    $('#formFeedback').addEventListener('submit', enviarFeedback);

    // Modal Perfil.
    $('#btnPerfil').addEventListener('click', abrirModal);
    $$('[data-close-modal]').forEach(el => el.addEventListener('click', fecharModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
  }

  function selecionarApoio(card) {
    const apoio = card.getAttribute('data-apoio');
    estado.apoio = apoio;
    estado.audioOpcional = false;

    $$('.apoio-card').forEach(c => c.setAttribute('aria-checked', String(c === card)));
    $('#btnApoioContinuar').disabled = false;

    // Apoio padrão: revelar o interruptor de áudio opcional (RF-08).
    const painel = $('#padraoAudioPanel');
    const chk = $('#chkAudioOpcional');
    if (apoio === 'PADRAO') {
      painel.hidden = false;
      estado.audioOpcional = chk.checked;
    } else {
      painel.hidden = true;
      chk.checked = false;
    }
    Audio.parar();
    anunciar(APOIOS[apoio].rotulo + ' selecionado.');
    if (apoio === 'SONORO') {
      Audio.falar('Apoio sonoro selecionado. As instruções serão lidas em voz alta.', true);
    }
  }

  function enviarFeedback(e) {
    e.preventDefault();
    const escolhido = $('input[name="avaliacao"]:checked');
    const erro = $('#feedbackErro');

    if (!escolhido) {
      erro.textContent = 'Selecione uma opção (Sim, Parcialmente ou Não) ou use “Pular”.';
      erro.hidden = false;
      return;
    }
    erro.hidden = true;

    const comentario = $('#comentario').value.trim();
    // MVP: nada é enviado a servidor nem armazenado de forma persistente (RN-10).
    $('#formFeedback').hidden = true;
    const ok = $('#feedbackOk');
    $('#feedbackOkTexto').textContent =
      'Feedback registrado (demonstrativo): ' + escolhido.value.toLowerCase() +
      (comentario ? '. Obrigado pelo comentário!' : '. Obrigado!');
    ok.hidden = false;
    anunciar('Feedback registrado. Obrigado!');
  }

  /* -------------------------------------------------------------- MODAL */
  let ultimoFoco = null;
  function abrirModal() {
    ultimoFoco = document.activeElement;
    const m = $('#modalPerfil');
    m.hidden = false;
    const fechar = $('[data-close-modal]', m);
    if (fechar) fechar.focus();
  }
  function fecharModal() {
    const m = $('#modalPerfil');
    if (m.hidden) return;
    m.hidden = true;
    if (ultimoFoco) ultimoFoco.focus();
  }

  /* -------------------------------------------------------------- INÍCIO */
  document.addEventListener('DOMContentLoaded', () => {
    ligarEventos();
    Etapas.ir('inicio');
    // Vozes do Speech podem carregar de forma assíncrona.
    if (Audio.suportado) window.speechSynthesis.getVoices();
  });
})();
