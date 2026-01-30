let gameState = {
        candidate: null,
        turn: 1,
        eventQueue: [],
        triggeredThresholds: []
    };

    // --- MOTEUR ---

    function initRoster() {
        const d = document.getElementById('roster');
        CANDIDATES.forEach(c => {
            let el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `<h3 class="gold">${c.name}</h3><small>${c.party}</small>`;
            el.onclick = () => startGame(c);
            d.appendChild(el);
        });
    }

    function startGame(c) {
        gameState.candidate = c;
        gameState.turn = 1;
        gameState.triggeredThresholds = [];
        
        // Init Stats
        for (let k in c.stats) {
            if(POPULATION[k]) POPULATION[k].score = c.stats[k];
        }

        // SELECTION ALEATOIRE CHRONOLOGIQUE
        let shuffled = [...SCENARIO_EVENTS].sort(() => 0.5 - Math.random());
        let selected = shuffled.slice(0, 30); // On en garde 30
        selected.sort((a, b) => SCENARIO_EVENTS.indexOf(a) - SCENARIO_EVENTS.indexOf(b)); // On remet dans l'ordre
        gameState.eventQueue = selected;

        // UI
        document.getElementById('selection-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        document.getElementById('candidate-name').innerText = c.name;
        document.getElementById('turn-count').innerText = `1/${selected.length}`;

        updateUI();
        playTurn();
    }

    function playTurn() {
        if (gameState.eventQueue.length === 0 || gameState.turn > 35) {
            endGame();
            return; 
        }

        // Meeting tous les 3 tours
        if (gameState.turn % 3 === 0) {
            showMeeting();
        } else {
            let evt = gameState.eventQueue.shift();
            if(!evt) { endGame(); return; }
            showEvent(evt);
        }
    }

    function showEvent(evt) {
        document.getElementById('date-display').innerText = evt.date;
        document.getElementById('event-badge').innerText = "ACTUALITÉ";
        document.getElementById('event-badge').style.background = "var(--gold)";
        
        document.getElementById('event-title').innerText = evt.title;
        document.getElementById('event-desc').innerText = evt.desc;

        const c = document.getElementById('choices-container');
        c.innerHTML = '';

        evt.choices.forEach(ch => {
            if (ch.cond && ch.cond !== gameState.candidate.id) return;

            let btn = document.createElement('div');
            btn.className = 'choice-btn';
            btn.innerHTML = `➤ ${ch.txt}`;
            btn.onclick = () => {
                applyEffect(ch.eff);
                nextTurn();
            };
            c.appendChild(btn);
        });
    }

    function showMeeting() {
        document.getElementById('event-badge').innerText = "ORGANISATION";
        document.getElementById('event-badge').style.background = "#fff";

        document.getElementById('event-title').innerText = "Grand Meeting";
        document.getElementById('event-desc').innerText = "Rassemblement stratégique. Choisissez le lieu.";

        const c = document.getElementById('choices-container');
        c.innerHTML = '';

        let places = [...MEETING_PLACES].sort(() => 0.5 - Math.random()).slice(0, 3);
        
        places.forEach(p => {
            let btn = document.createElement('div');
            btn.className = 'choice-btn';
            btn.innerHTML = `<span class="bold">${p.name}</span> <span style="font-style:italic; opacity:0.7; font-size:0.9em;">(${p.type})</span>`;
            btn.onclick = () => {
                applyEffect(p.eff);
                nextTurn();
            };
            c.appendChild(btn);
        });
    }

    function applyEffect(eff) {
        let inertiaChanged = false; // Pour savoir si on doit notifier le joueur

        for (let k in eff) {
            if(POPULATION[k]) {
                let baseVal = eff[k];
                
                // 1. Récupérer l'inertie actuelle
                let inertiaKey = gameState.candidate.inertia[k] || "NEUTRAL";
                let inertia = INERTIA_RULES[inertiaKey];
                
                // 2. Appliquer Bonus/Malus d'inertie
                // (Si le peuple t'aime, les bonus comptent +, les malus comptent -)
                let multiplier = 1.0;
                if (baseVal > 0) multiplier = inertia.bonus; 
                else multiplier = inertia.malus; 
                
                // 3. Calcul du nouveau score
                let finalVal = baseVal * multiplier * IMPACT_FACTOR;
                POPULATION[k].score += finalVal;
                
                // Caps (Bornes 0 - 100)
                if(POPULATION[k].score < 0) POPULATION[k].score = 0;
                if(POPULATION[k].score > 100) POPULATION[k].score = 100;

                // 4. MISE A JOUR DYNAMIQUE DE L'INERTIE
                if (updateDynamicInertia(k)) {
                    inertiaChanged = true;
                }
            }
        }
        
        checkThresholds(); // Vérifie les événements scriptés (grèves, etc.)
        
        // Si l'inertie a changé, on pourrait afficher un petit message (optionnel)
        if(inertiaChanged) {
            // console.log("L'opinion a changé !");
        }
    }
    
    function updateDynamicInertia(categoryKey) {
        let score = POPULATION[categoryKey].score;
        let currentInertia = gameState.candidate.inertia[categoryKey] || "NEUTRAL";
        let newInertia = "NEUTRAL";

        // Définition des paliers de confiance
        if (score >= 80) newInertia = "LOVE";       // > 80% : Ils sont fans (Bonus max)
        else if (score >= 60) newInertia = "LIKE";  // > 60% : Ils soutiennent (Bonus moyen)
        else if (score >= 40) newInertia = "NEUTRAL"; // 40-60% : Ventre mou
        else if (score >= 20) newInertia = "DISLIKE"; // 20-40% : Méfiance
        else newInertia = "HATE";                   // < 20% : Rejet total (Malus max)

        // Si le statut change, on le sauvegarde
        if (newInertia !== currentInertia) {
            gameState.candidate.inertia[categoryKey] = newInertia;
            return true; // Indique qu'il y a eu un changement
        }
        return false;
    }

    function checkThresholds() {
        for (let key in POPULATION) {
            let score = POPULATION[key].score;
            let data = THRESHOLD_EVENTS[key];
            
            let lowID = key + "_low";
            if (score < data.low.threshold && !gameState.triggeredThresholds.includes(lowID)) {
                triggerThresholdEvent(data.low, lowID);
                return; 
            }

            let highID = key + "_high";
            if (score > data.high.threshold && !gameState.triggeredThresholds.includes(highID)) {
                triggerThresholdEvent(data.high, highID);
                return;
            }
        }
    }

    function triggerThresholdEvent(evtData, id) {
        gameState.triggeredThresholds.push(id);
        let newEvent = {
            title: "⚠️ " + evtData.title,
            desc: evtData.desc,
            date: "ALERTE INFO",
            choices: [ { txt: evtData.btn, eff: evtData.eff } ]
        };
        gameState.eventQueue.unshift(newEvent);
    }

    function nextTurn() {
        gameState.turn++;
        updateUI();
        playTurn(); 
    }

    function getGlobalScore() {
        let total = 0;
        let w = 0;
        for(let k in POPULATION) {
            total += POPULATION[k].score * POPULATION[k].weight;
            w += POPULATION[k].weight;
        }
        return total / w;
    }

    function updateUI() {
        const d = document.getElementById('polls-container');
        d.innerHTML = '';
        let sorted = Object.keys(POPULATION).sort((a,b) => POPULATION[b].score - POPULATION[a].score);
        
        sorted.forEach(k => {
            let p = POPULATION[k];
            // Inertia Icon
            let iKey = gameState.candidate.inertia[k] || "NEUTRAL";
            let icon = INERTIA_RULES[iKey].icon;

            let row = document.createElement('div');
            row.className = 'stat-line';
            let color = p.score > 50 ? 'var(--gold)' : (p.score < 15 ? '#c0392b' : '#ddd');
            
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span>${p.label} <span class="inertia-icon" title="Inertie">${icon}</span></span>
                    <span style="color:${color}">${p.score.toFixed(1)}%</span>
                </div>
                <div class="bar-container"><div class="bar-fill" style="width:${p.score}%; background:${color}"></div></div>
            `;
            d.appendChild(row);
        });

        let sc = getGlobalScore();
        document.getElementById('main-score').innerText = sc.toFixed(1) + "%";
        
        let t = "Stable";
        if (sc >= 50) t = "▲ Élu 1er tour";
        else if (sc >= 20) t = "▲ Qualifié 2nd tour";
        else t = "▼ En difficulté";
        document.getElementById('trend-indicator').innerText = t;
        
        // Update turn display dynamically based on remaining queue
        // (Approximation visuelle)
    }

    function endGame() {
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-screen').style.display = 'none'; 
        document.getElementById('results-screen').classList.add('active');
        document.getElementById('results-screen').style.display = 'flex';

        let sc = getGlobalScore();
        document.getElementById('final-score').innerText = sc.toFixed(2) + "%";

        let st = ""; let txt = "";
        if (sc >= 50) { st = "PRÉSIDENT"; txt = "Triomphe historique."; }
        else if (sc >= 18) { st = "QUALIFIÉ"; txt = "La finale commence."; }
        else if (sc >= 5) { st = "DÉFAITE"; txt = "L'honneur est sauf."; }
        else { st = "NAUFRAGE"; txt = "Fin de carrière."; }

        document.getElementById('final-status').innerText = st;
        document.getElementById('final-desc').innerText = txt;
    }

    initRoster();
