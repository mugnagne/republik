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
        gameState.scoreHistory = {}; // NOUVEAU : Pour stocker l'historique

        // Init Stats & Historique
        for (let k in c.stats) {
            if(POPULATION[k]) {
                POPULATION[k].score = c.stats[k];
                // On initialise l'historique avec le score de départ pour chaque catégorie
                gameState.scoreHistory[k] = [c.stats[k]]; 
            }
        }

       let shuffled = [...SCENARIO_EVENTS].sort(() => 0.5 - Math.random());
        let selected = shuffled.slice(0, 30); 
        selected.sort((a, b) => SCENARIO_EVENTS.indexOf(a) - SCENARIO_EVENTS.indexOf(b)); 
        gameState.eventQueue = selected;

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
             // CE QU'IL FAUT ÉCRIRE (CORRECTION) :
btn.onclick = () => {
    applyEffect(p.eff); // <--- "p" est le lieu, "eff" sont les effets
    nextTurn();
};
            c.appendChild(btn);
        });
    }
function applyEffect(eff) {
        let inertiaChanged = false;

        for (let k in eff) {
            if(POPULATION[k]) {
                let baseVal = eff[k];
                
                // 1. Récupérer l'inertie actuelle
                let inertiaKey = gameState.candidate.inertia[k] || "NEUTRAL";
                let inertia = INERTIA_RULES[inertiaKey];
                
                // 2. Appliquer Bonus/Malus d'inertie
                let multiplier = 1.0;
                if (baseVal > 0) multiplier = inertia.bonus; 
                else multiplier = inertia.malus; 
                
                // --- NOUVEAU : PLAFOND DE VERRE (Diminishing Returns) ---
                // Plus le score est haut, plus c'est dur de monter
                let currentScore = POPULATION[k].score;
                let glassCeiling = 1.0;
                
                if (baseVal > 0) { // Si on gagne des points
                    if (currentScore > 50) glassCeiling = 0.5;  // 50% gain au-dessus de 50%
                    if (currentScore > 70) glassCeiling = 0.2;  // 20% gain au-dessus de 70%
                    if (currentScore > 85) glassCeiling = 0.05; // Quasi impossible de monter plus haut
                }
                
                // --- NOUVEAU : SOMME NULLE (Résistance) ---
                // Voler des voix est dur si le réservoir est "vide" (autres candidats)
                // Ici simulé par le fait qu'on ne peut pas dépasser 100% (déjà géré par les caps)
                // Mais on pourrait ajouter une "résistance" si on voulait complexifier.
                // Pour l'instant, le plafond de verre suffit à simuler la difficulté de convaincre les derniers récalcitrants.

                // 3. Calcul du nouveau score avec tous les facteurs
                let finalVal = baseVal * multiplier * IMPACT_FACTOR * glassCeiling;
                
                POPULATION[k].score += finalVal;
                
                // Caps
                if(POPULATION[k].score < 0) POPULATION[k].score = 0;
                if(POPULATION[k].score > 100) POPULATION[k].score = 100;

                // 4. Mise à jour de l'historique
                if (updateMomentumInertia(k)) {
                    inertiaChanged = true;
                }
            }
        }
        
        applyNaturalDecay(); // <--- APPEL DE LA NOUVELLE FONCTION D'ÉROSION
        checkThresholds();
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
function updateMomentumInertia(key) {
        let history = gameState.scoreHistory[key];
        let currentScore = POPULATION[key].score;

        // Ajouter le nouveau score à l'historique
        history.push(currentScore);
        
        // Garder seulement les 5 derniers tours pour le calcul de tendance
        if (history.length > 5) {
            history.shift(); // Enlève le plus vieux
        }

        // S'il n'y a pas assez d'historique (début de partie), on reste sur l'inertie de base
        if (history.length < 2) return false;

        // Calcul de la tendance : Score Actuel vs Moyenne des tours précédents
        // On compare le score actuel au score d'il y a 'n' tours (le plus vieux de la liste)
        let oldestScore = history[0];
        let delta = currentScore - oldestScore; // Positif = progression, Négatif = chute

        let currentInertia = gameState.candidate.inertia[key] || "NEUTRAL";
        let newInertia = "NEUTRAL";

        // Définition des seuils de dynamique (sur ~3-5 tours)
        // Note: Ces seuils dépendent de votre IMPACT_FACTOR. 
        // Si IMPACT_FACTOR est 0.2, gagner 2 ou 3 points réels est une grosse perf.
        
        if (delta >= 3.0) newInertia = "LOVE";        // Forte hausse (> +3pts)
        else if (delta >= 1.0) newInertia = "LIKE";   // Hausse modérée (+1 à +3pts)
        else if (delta > -1.0) newInertia = "NEUTRAL"; // Stagnation (-1 à +1pts)
        else if (delta > -3.0) newInertia = "DISLIKE"; // Baisse modérée (-1 à -3pts)
        else newInertia = "HATE";                     // Chute libre (< -3pts)

        // Mise à jour si changement
        if (newInertia !== currentInertia) {
            gameState.candidate.inertia[key] = newInertia;
            return true;
        }
        return false;
    }
    initRoster();
