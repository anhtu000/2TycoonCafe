// In-page playtest bot for the test build (window.__play). Plays like a first-time player who taps steadily:
// serves ready orders (VIPs first), makes what customers want, claims tasks and daily orders, opens floors and
// items when affordable, buys what the task asks for or else the cheapest card, closes windows with the plain
// button (never a rewarded one, never the timed run). Started with window.__botStart(handMs, metaMs).
(() => {
  const B = (window.__bot = { hand: 0, buys: 0, claims: 0, floors: 0, items: 0, decor: 0, panels: 0, presses: [], stuckPanels: 0, notices: 0 });
  const WANT = ['Claim', 'Collect', 'Keep playing', 'Nice!', 'Back to my cafe', 'Close'];
  const REWARD = 0x8b5cf6;
  const buttons = (node, out = []) => {
    for (const c of (node && node.list) || []) {
      if (c && c.opts && typeof c.opts.onClick === 'function' && 'enabled' in c) out.push(c);
      if (c && c.list) buttons(c, out);
    }
    return out;
  };
  const label = (b) => ((b.labelText && b.labelText.text) || '').trim();
  const press = (b) => {
    b.emit('pointerdown');
    b.emit('pointerup');
    B.presses.push(label(b) || '(icon)');
    if (B.presses.length > 40) B.presses.shift();
  };
  let panelSeen = null;
  let panelTicks = 0;

  function handlePanel(P) {
    if (P.panel !== panelSeen) {
      panelSeen = P.panel;
      panelTicks = 0;
      B.panels++;
    }
    panelTicks++;
    if (panelTicks < 3) return; // let it open
    const bs = buttons(P.panel).filter((b) => b.visible !== false && b.enabled && b.active);
    const pick = P.barPick();
    const decorTask = pick && pick.kind === 'task' && pick.task.type === 'decor' && !P.cafe.taskDone(pick.task);
    if (decorTask) {
      const buy = bs.find((b) => b.opts.icon && b.opts.color !== REWARD && /\d/.test(label(b)) && !label(b).includes('✓'));
      if (buy) {
        press(buy);
        B.decor++;
        return;
      }
    }
    if (window.__preferReward) {
      const r = bs.find((x) => x.opts.color === REWARD && /x\d/.test(label(x)));
      if (r) {
        B.rewardPresses = (B.rewardPresses || 0) + 1;
        B.coinsBeforeReward = Math.round(P.cafe.s.coins);
        press(r);
        return;
      }
    }
    for (const w of WANT) {
      const b = bs.find((x) => label(x) === w && x.opts.color !== REWARD);
      if (b) {
        press(b);
        return;
      }
    }
    if (panelTicks > 12) {
      B.stuckPanels++;
      P.panel.close();
    }
  }

  function hand(P) {
    const cafe = P.cafe;
    const s = cafe.s;
    const waiting = s.customers.filter((c) => c.phase === 'wait' && !c.reserved);
    const servable = waiting.filter((c) => s.items[c.item].ready > 0).sort((a, b) => Number(!!b.vip) - Number(!!a.vip) || a.patience - b.patience);
    if (servable.length) {
      P.tapCustomer(servable[0].id, 0, 0);
      B.hand++;
      return;
    }
    const need = new Map();
    for (const c of s.customers) if (c.phase !== 'leave' && !c.reserved) need.set(c.item, (need.get(c.item) || 0) + 1);
    let best = null;
    let bestScore = 0;
    for (const [item, n] of need) {
      const st = s.items[item];
      const short = n - st.ready - (st.job !== null ? 1 : 0);
      const staffed = Boolean(s.assign[item]);
      const score = (short > 0 ? 2 : st.job !== null && n > st.ready ? 1 : 0) + (staffed ? 0 : 0.5);
      if (score > bestScore && st.ready < cafe.content.cafe.counterCap) {
        bestScore = score;
        best = item;
      }
    }
    if (best && bestScore >= 1) {
      P.tapMachine(best, 0, 0);
      B.hand++;
    }
  }

  function meta(P) {
    const cafe = P.cafe;
    const s = cafe.s;
    const content = cafe.content;
    // Tutorial steps that only need "Got it": press it, like a player would.
    if (P.tut.active && P.tut.ackButton && P.tut.ackButton.active) {
      press(P.tut.ackButton);
      return;
    }
    const tutId = P.tut.active ? P.tut.currentId : null;
    // Now and then (every 3 game minutes at most) watch a rewarded ad on the boost card, like many players do.
    const now = performance.now();
    const card = P.shop.cards.get('__boost');
    const boost = P.shop.boost;
    if (!P.tut.active && card && boost && boost.wait <= 0 && !boost.blocked && !P.shop.boostBusy && now - (B.lastAd || 0) > 180000) {
      B.lastAd = now;
      B.ads = (B.ads || 0) + 1;
      P.shop.tapBoost(card);
      return;
    }
    if (!P.tut.active) {
      const pick = P.barPick();
      if (pick && pick.kind === 'task' && (cafe.taskDone(pick.task) || pick.task.type === 'decor')) {
        if (cafe.taskDone(pick.task)) B.claims++;
        P.tapTask();
        return;
      }
      if (pick && pick.kind === 'order' && cafe.orderDone(cafe.orders()[pick.index])) {
        B.claims++;
        P.tapTask();
        return;
      }
    }
    for (let i = 0; i < content.cafe.floors.length; i++) {
      const f = content.cafe.floors[i];
      if (!s.floors[i].open && (i === 0 || s.floors[i - 1].open) && s.coins >= f.unlockCost) {
        P.openFloor(i);
        B.floors++;
        return;
      }
    }
    for (const it of content.cafe.items) {
      if (!s.items[it.id].unlocked && s.floors[cafe.floorIndexOf(it.id)].open && s.coins >= it.unlockCost) {
        P.unlockItem(it.id);
        B.items++;
        return;
      }
    }
    const t = cafe.task();
    let want = tutId === 'adopt' || tutId === 'freeAdopt' ? 'adopt' : tutId === 'upgrade' ? 'item:coffee' : null;
    if (!want && t && !cafe.taskDone(t)) {
      const fi = content.cafe.floors.findIndex((f) => f.id === t.floor);
      want = { itemLevel: `item:${t.item}`, upgrade: `up:${t.upgrade}`, adopts: 'adopt', staff: 'adopt', seats: `seat:${fi}` }[t.type] || null;
    }
    const aff = P.shopEntries()
      .filter((e) => e.affordable && e.cost !== null)
      .sort((a, b) => Number(b.id === want) - Number(a.id === want) || a.cost - b.cost);
    if (aff.length) {
      aff[0].onBuy();
      B.buys++;
    }
  }

  window.__botStart = (handMs, metaMs) => {
    setInterval(() => {
      const P = window.__play;
      if (!P || !P.cafe || P.panel || !P.sys.isActive() || P.game.isPaused) return;
      try {
        hand(P);
      } catch (e) {
        B.lastError = String(e);
      }
    }, handMs);
    setInterval(() => {
      const P = window.__play;
      if (!P || !P.cafe || !P.sys.isActive() || P.game.isPaused) return;
      try {
        if (P.panel) handlePanel(P);
        else meta(P);
      } catch (e) {
        B.lastError = String(e);
      }
    }, metaMs);
  };

  window.__botSample = () => {
    const P = window.__play;
    const s = P && P.cafe && P.cafe.s;
    return {
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      textures: P ? Object.keys(P.sys.textures.list).length : null,
      objects: P ? P.children.list.length : null,
      dom: document.getElementsByTagName('*').length,
      stars: P ? P.cafe.stars() : null,
      coins: s ? Math.round(s.coins) : null,
      rate: s ? Math.round(s.rate) : null,
      served: s ? s.served : null,
      staff: P ? P.cafe.staffCount() : null,
      floors: s ? s.floors.filter((f) => f.open).length : null,
      finished: s ? s.finishedAt !== null : null,
      orders: P ? P.cafe.orders().map((o) => `${o.type}${o.claimed ? '✓' : ''}`).join(',') : '',
      panel: P && P.panel ? 'open' : '',
      tut: P && P.tut.active ? 'on' : '',
      bot: { ...B, presses: B.presses.slice(-6) },
    };
  };
})();
