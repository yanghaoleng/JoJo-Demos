const quizzes = [
  {
    question: "在学会种植以前，人们会怎样寻找食物？",
    options: ["跟着水草迁徙", "住在固定的高楼里", "每天去集市购买"],
    correct: 0,
    success: "答对了。那时的人们常常跟着水源和草场迁徙。",
    retry: "再看看故事里的水、鱼和草，它们都在提示答案。",
  },
  {
    question: "原始农业出现后，人们的生活发生了什么变化？",
    options: ["开始学习航海", "逐渐从迁徙走向定居", "只在山顶生活"],
    correct: 1,
    success: "答对了。种植让人们可以逐渐定居下来。",
    retry: "想一想，不必经常搬家以后，人们会怎样生活？",
  },
];

const reader = document.querySelector("#reader");
const readerViewport = document.querySelector("#readerViewport");
const pageTrack = document.querySelector("#pageTrack");
const pageStatus = document.querySelector("#pageStatus");
const pageDots = [...document.querySelectorAll(".page-dots i")];
const quizDock = document.querySelector("#quizDock");
const quizTrigger = document.querySelector("#quizTrigger");
const quizCard = document.querySelector("#quizCard");
const collapseQuiz = document.querySelector("#collapseQuiz");
const questionText = document.querySelector("#questionText");
const quizOptions = document.querySelector("#quizOptions");
const quizFeedback = document.querySelector("#quizFeedback");
const listenQuestion = document.querySelector("#listenQuestion");

const cornerClasses = ["corner-tl", "corner-tr", "corner-bl", "corner-br"];
let currentPage = 0;
let selectedAnswer = null;
let isQuizOpen = false;
let dragState = null;
let swipeStart = null;
let revealTimer = null;
let openOnNextFlip = false;

const TRIGGER_REVEAL_DELAY = 2000;

function setCorner(corner) {
  quizDock.classList.remove(...cornerClasses);
  quizDock.classList.add(corner);
  try {
    localStorage.setItem("ti-quiz-corner", corner);
  } catch {
    // Local storage can be unavailable in private browsing.
  }
}

function restoreCorner() {
  let savedCorner = "corner-tr";
  try {
    const stored = localStorage.getItem("ti-quiz-corner");
    if (cornerClasses.includes(stored)) savedCorner = stored;
  } catch {
    // Keep the default corner when storage is unavailable.
  }
  setCorner(savedCorner);
}

function renderQuiz() {
  const quiz = quizzes[currentPage];
  selectedAnswer = null;
  questionText.textContent = quiz.question;
  quizFeedback.textContent = "选一个答案试试看";
  quizFeedback.className = "quiz-feedback";
  quizOptions.replaceChildren();

  quiz.options.forEach((option, index) => {
    const button = document.createElement("button");
    const mark = document.createElement("span");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "quiz-option";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    mark.className = "quiz-option__mark";
    mark.textContent = String.fromCharCode(65 + index);
    label.textContent = option;
    button.append(mark, label);
    button.addEventListener("click", () => chooseAnswer(index));
    quizOptions.append(button);
  });
}

function chooseAnswer(index) {
  const quiz = quizzes[currentPage];
  const optionButtons = [...quizOptions.querySelectorAll(".quiz-option")];
  selectedAnswer = index;

  optionButtons.forEach((button, optionIndex) => {
    button.classList.remove("is-correct", "is-wrong");
    button.setAttribute("aria-checked", String(optionIndex === index));
  });

  if (index === quiz.correct) {
    optionButtons[index].classList.add("is-correct");
    quizFeedback.textContent = quiz.success;
    quizFeedback.className = "quiz-feedback is-success";
  } else {
    optionButtons[index].classList.add("is-wrong");
    quizFeedback.textContent = quiz.retry;
    quizFeedback.className = "quiz-feedback is-error";
  }
}

function revealQuizTrigger() {
  window.clearTimeout(revealTimer);
  quizDock.classList.add("is-ready");
}

function resetQuizDock() {
  window.clearTimeout(revealTimer);
  isQuizOpen = false;
  quizDock.classList.remove("is-ready", "is-open");
  quizTrigger.setAttribute("aria-expanded", "false");
  quizCard.setAttribute("aria-hidden", "true");
}

function scheduleQuizTrigger() {
  resetQuizDock();
  revealTimer = window.setTimeout(revealQuizTrigger, TRIGGER_REVEAL_DELAY);
}

function openQuiz() {
  revealQuizTrigger();
  openOnNextFlip = false;
  isQuizOpen = true;
  quizDock.classList.add("is-open");
  quizTrigger.setAttribute("aria-expanded", "true");
  quizCard.setAttribute("aria-hidden", "false");
  window.setTimeout(() => collapseQuiz.focus({ preventScroll: true }), 260);
}

function closeQuiz({ focusTrigger = true } = {}) {
  isQuizOpen = false;
  quizDock.classList.remove("is-open");
  quizTrigger.setAttribute("aria-expanded", "false");
  quizCard.setAttribute("aria-hidden", "true");
  if (focusTrigger) {
    window.setTimeout(() => quizTrigger.focus({ preventScroll: true }), 180);
  }
}

function updatePageControls() {
  pageTrack.style.setProperty("--page-index", currentPage);
  pageStatus.textContent = `第 ${currentPage + 1} 页，共 ${quizzes.length} 页`;
  pageDots.forEach((dot, index) => dot.classList.toggle("is-active", index === currentPage));
}

function goToPage(nextIndex) {
  const clampedIndex = Math.max(0, Math.min(quizzes.length - 1, nextIndex));
  if (clampedIndex === currentPage) return;

  const shouldOpenAfterFlip = openOnNextFlip;
  currentPage = clampedIndex;
  updatePageControls();
  renderQuiz();

  if (shouldOpenAfterFlip) {
    openQuiz();
  } else {
    openOnNextFlip = true;
    scheduleQuizTrigger();
  }
}

function speakQuestion() {
  if (!("speechSynthesis" in window)) {
    quizFeedback.textContent = "当前浏览器暂不支持朗读。";
    quizFeedback.className = "quiz-feedback is-error";
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(quizzes[currentPage].question);
  utterance.lang = "zh-CN";
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function beginDrag(event) {
  if (isQuizOpen || event.button > 0) return;

  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  quizTrigger.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;
  if (Math.hypot(deltaX, deltaY) > 6) dragState.moved = true;
  if (!dragState.moved) return;

  quizDock.classList.add("is-dragging");
  quizTrigger.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1.04)`;
}

function endDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const wasMoved = dragState.moved;
  quizTrigger.releasePointerCapture(event.pointerId);
  quizDock.classList.remove("is-dragging");
  quizTrigger.style.removeProperty("transform");

  if (wasMoved) {
    const rect = reader.getBoundingClientRect();
    const horizontal = event.clientX < rect.left + rect.width / 2 ? "l" : "r";
    const vertical = event.clientY < rect.top + rect.height / 2 ? "t" : "b";
    setCorner(`corner-${vertical}${horizontal}`);
  } else {
    openQuiz();
  }

  dragState = null;
}

function beginSwipe(event) {
  if (event.target.closest("button") || event.target.closest(".quiz-card")) return;
  swipeStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
}

function endSwipe(event) {
  if (!swipeStart || event.pointerId !== swipeStart.pointerId) return;

  const deltaX = event.clientX - swipeStart.x;
  const deltaY = event.clientY - swipeStart.y;
  swipeStart = null;

  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
  goToPage(currentPage + (deltaX < 0 ? 1 : -1));
}

restoreCorner();
renderQuiz();
updatePageControls();
scheduleQuizTrigger();

quizTrigger.addEventListener("pointerdown", beginDrag);
quizTrigger.addEventListener("pointermove", moveDrag);
quizTrigger.addEventListener("pointerup", endDrag);
quizTrigger.addEventListener("pointercancel", endDrag);
quizTrigger.addEventListener("click", (event) => {
  if (event.detail === 0) openQuiz();
});
collapseQuiz.addEventListener("click", () => closeQuiz());
listenQuestion.addEventListener("click", speakQuestion);
readerViewport.addEventListener("pointerdown", beginSwipe);
readerViewport.addEventListener("pointerup", endSwipe);
readerViewport.addEventListener("pointercancel", () => {
  swipeStart = null;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isQuizOpen) closeQuiz();
});
