// --- Audio System (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, vol=0.1) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playCorrect() {
    playTone(600, 'sine', 0.1);
    setTimeout(() => playTone(800, 'sine', 0.15), 100);
}

function playEnd() {
    playTone(400, 'square', 0.1);
    setTimeout(() => playTone(500, 'square', 0.1), 150);
    setTimeout(() => playTone(600, 'square', 0.2), 300);
    setTimeout(() => playTone(800, 'square', 0.4), 450);
}

// --- App State ---
const app = {
    mode: null,
    batches: ['2-5', '6-9', '11-15', '16-20'],
    numbers: [12, 13, 14, 15, 16, 17, 18, 19],
    
    quizSelections: new Set(),
    currentPracticeChallenge: null,

    questions: [],
    currentQIndex: 0,
    currentInput: "",
    
    stats: {
        totalTime: 0,
        right: 0,
        questionStartTime: 0,
        animFrame: null
    },

    navTo(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if (screenId === 'screen-home') {
            this.mode = null;
            this.resetState();
            this.renderMatrices();
        }
    },

    resetState() {
        this.currentInput = "";
        this.questions = [];
        this.currentQIndex = 0;
        this.stats = { totalTime: 0, right: 0, questionStartTime: 0, animFrame: null };
        this.updateInputDisplay();
    },

    abortSession() {
        if (this.stats.animFrame) cancelAnimationFrame(this.stats.animFrame);
        this.navTo('screen-home');
    },

    init() {
        this.renderMatrices();
        this.initKeyboard();
    },

    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            // Only process keyboard input if we are on the question screen
            const questionScreen = document.getElementById('screen-question');
            if (!questionScreen.classList.contains('active')) return;

            if (e.key >= '0' && e.key <= '9') {
                this.numpadPress(parseInt(e.key));
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.numpadDelete();
            }
        });
    },

    checkCompleted(num, batch) {
        return localStorage.getItem(`practice_${num}_${batch}`) === 'true';
    },

    setCompleted(num, batch) {
        localStorage.setItem(`practice_${num}_${batch}`, 'true');
    },

    renderMatrices() {
        const pGrid = document.getElementById('practice-matrix');
        const qGrid = document.getElementById('quiz-matrix');
        
        let headerHtml = `<div class="matrix-cell"></div>`;
        this.batches.forEach(b => {
            headerHtml += `<div class="matrix-header">${b}</div>`;
        });

        let pHtml = headerHtml;
        let qHtml = headerHtml;

        this.numbers.forEach(n => {
            pHtml += `<div class="matrix-row-label">${n}</div>`;
            qHtml += `<div class="matrix-row-label">${n}</div>`;

            this.batches.forEach(b => {
                let isCompleted = this.checkCompleted(n, b);
                
                // Practice Button
                let pClass = isCompleted ? 'circle-btn completed' : 'circle-btn';
                pHtml += `
                    <div class="matrix-cell">
                        <button class="${pClass}" onclick="app.startPractice(${n}, '${b}')"></button>
                    </div>`;

                // Quiz Button
                let isSelected = this.quizSelections.has(`${n}_${b}`);
                let qClass = isSelected ? 'circle-btn selected' : 'circle-btn';
                qHtml += `
                    <div class="matrix-cell">
                        <button class="${qClass}" onclick="app.toggleQuizSelection(${n}, '${b}')"></button>
                    </div>`;
            });
        });

        pGrid.innerHTML = pHtml;
        qGrid.innerHTML = qHtml;
    },

    toggleQuizSelection(num, batch) {
        let key = `${num}_${batch}`;
        if (this.quizSelections.has(key)) {
            this.quizSelections.delete(key);
        } else {
            this.quizSelections.add(key);
        }
        this.renderMatrices();
    },

    getMultipliersFromBatch(batchStr) {
        let parts = batchStr.split('-');
        let start = parseInt(parts[0]);
        let end = parseInt(parts[1]);
        let res = [];
        for(let i=start; i<=end; i++) res.push(i);
        return res;
    },

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    },

    startPractice(num, batch) {
        this.mode = 'practice';
        this.currentPracticeChallenge = { num, batch };
        this.resetState();

        let multipliers = this.getMultipliersFromBatch(batch);
        let reps = parseInt(document.getElementById('repetitions').value) || 2;
        
        for (let i=0; i<reps; i++) {
            let temp = [...multipliers];
            this.shuffle(temp);
            temp.forEach(m => {
                this.questions.push({ n1: num, n2: m, ans: num * m });
            });
        }

        // Show study screen first
        let studyHtml = '';
        multipliers.sort((a,b)=>a-b).forEach(m => {
            studyHtml += `<div>${num} x ${m} = <span style="color:var(--primary)">${num * m}</span></div>`;
        });
        document.getElementById('study-content').innerHTML = studyHtml;
        this.navTo('screen-study');
    },

    startQuiz() {
        if (this.quizSelections.size === 0) {
            alert("Please select at least one section in the grid.");
            return;
        }
        this.mode = 'quiz';
        this.resetState();

        let allPotentialQ = [];
        this.quizSelections.forEach(key => {
            let parts = key.split('_');
            let num = parseInt(parts[0]);
            let batch = parts[1];
            let multipliers = this.getMultipliersFromBatch(batch);
            
            multipliers.forEach(m => {
                allPotentialQ.push({ n1: num, n2: m, ans: num * m });
            });
        });

        this.shuffle(allPotentialQ);

        let limit = parseInt(document.getElementById('quiz-limit').value) || 10;
        
        while (this.questions.length < limit) {
            let temp = [...allPotentialQ];
            this.shuffle(temp);
            for (let i=0; i < temp.length && this.questions.length < limit; i++) {
                this.questions.push(temp[i]);
            }
        }

        this.startQuestions();
    },

    startQuestions() {
        if (this.questions.length === 0) return;
        this.navTo('screen-question');
        this.loadQuestion();
    },

    loadQuestion() {
        if (this.currentQIndex >= this.questions.length) {
            this.finishSession();
            return;
        }
        this.currentInput = "";
        this.updateInputDisplay();
        
        let q = this.questions[this.currentQIndex];
        let text = Math.random() > 0.5 ? `${q.n1} x ${q.n2}` : `${q.n2} x ${q.n1}`;
        document.getElementById('question-text').innerText = `${text} = ?`;
        document.getElementById('question-counter').innerText = `Q: ${this.currentQIndex + 1}/${this.questions.length}`;
        
        this.startTimer();
    },

    startTimer() {
        this.stats.questionStartTime = Date.now();
        const timerText = document.getElementById('question-timer');
        const timerFill = document.getElementById('timer-fill');
        
        const update = () => {
            let elapsed = (Date.now() - this.stats.questionStartTime) / 1000;
            timerText.innerText = elapsed.toFixed(1) + 's';
            
            let pct = Math.max(0, 100 - (elapsed / 15 * 100));
            timerFill.style.width = pct + '%';
            
            if (elapsed > 10) timerFill.style.background = '#ef4444'; 
            else if (elapsed > 5) timerFill.style.background = '#f59e0b';
            else timerFill.style.background = 'var(--primary)';

            this.stats.animFrame = requestAnimationFrame(update);
        };
        update();
    },

    stopTimer() {
        cancelAnimationFrame(this.stats.animFrame);
        let elapsed = (Date.now() - this.stats.questionStartTime) / 1000;
        this.stats.totalTime += elapsed;
    },

    numpadPress(num) {
        if (this.currentInput.length < 4) {
            this.currentInput += num.toString();
            this.updateInputDisplay();
            this.checkAnswer();
        }
    },

    numpadDelete() {
        if (this.currentInput.length > 0) {
            this.currentInput = this.currentInput.slice(0, -1);
            this.updateInputDisplay();
        }
    },

    updateInputDisplay() {
        document.getElementById('answer-input').innerText = this.currentInput;
    },

    checkAnswer() {
        let q = this.questions[this.currentQIndex];
        let val = parseInt(this.currentInput);
        
        if (val === q.ans) {
            this.stopTimer();
            this.stats.right++;
            playCorrect();
            
            const overlay = document.getElementById('feedback-overlay');
            overlay.className = 'feedback-overlay correct-anim';
            
            setTimeout(() => {
                overlay.className = 'feedback-overlay';
                this.currentQIndex++;
                this.loadQuestion();
            }, 300);
        }
    },

    finishSession() {
        playEnd();
        
        if (this.mode === 'practice' && this.currentPracticeChallenge) {
            this.setCompleted(this.currentPracticeChallenge.num, this.currentPracticeChallenge.batch);
            this.renderMatrices();
        }

        this.navTo('screen-summary');
        
        document.getElementById('summary-time').innerText = this.stats.totalTime.toFixed(1) + 's';
        document.getElementById('summary-right').innerText = this.stats.right;
    }
};

window.onload = () => {
    app.init();
};
