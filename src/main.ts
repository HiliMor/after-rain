import './style.css';
import { Forest } from './forest';
import { ForestAudio } from './audio';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = new ForestAudio();
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string, duration = 4200) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), duration);
}
function fail(error: unknown) {
  console.error('The forest could not start:', error);
  $('loading').classList.add('done');
  $('error').hidden = false;
}

try {
  const forest = new Forest($('scene'), {
    onReady: (backend) => {
      document.documentElement.dataset.renderer = backend;
      $('loading').classList.add('done');
      setTimeout(() => $('loading').remove(), 1200);
    },
    onDrop: () => {
      audio.drop();
      toast('One small drop. A whole world of ripples.');
    },
    onDiscovery: () => {
      toast('A quiet neighbour. Give it a moment to get to know you.', 5500);
      $('snail-button').classList.add('discovered');
    },
    onError: fail,
  });
  $('drop-button').addEventListener('click', () => {
    if (forest.drop()) toast('Watch the tip of the leaf…', 1700);
    else toast('A new drop is gathering. Just a moment…', 2200);
  });
  $('light-button').addEventListener('click', () => {
    const on = forest.toggleLight();
    $('light-button').setAttribute('aria-pressed', String(on));
    $('light-button').classList.toggle('active', on);
    toast(on ? 'Move your light. The forest will follow.' : 'A moment in the moonlight.');
  });
  $('snail-button').addEventListener('click', () => forest.focusSnail());
  $('reset-button').addEventListener('click', () => {
    forest.reset();
    toast('Back to the little clearing.', 2400);
  });
  $('sound-button').addEventListener('click', async () => {
    try {
      const on = await audio.toggle();
      $('sound-button').setAttribute('aria-pressed', String(on));
      $('sound-button').setAttribute('aria-label', `Turn forest sound ${on ? 'off' : 'on'}`);
      toast(on ? 'Listen a little closer.' : 'Sound off.', 2000);
    } catch {
      toast('Sound is unavailable in this browser.');
    }
  });
  const notes = $('notes') as HTMLDialogElement;
  $('about-button').addEventListener('click', () => notes.showModal());
  $('close-notes').addEventListener('click', () => notes.close());
  notes.addEventListener('click', (e) => {
    const r = notes.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      notes.close();
  });
  if (matchMedia('(pointer: coarse)').matches)
    $('gesture-hint').innerHTML = 'TOUCH & DRAG TO ILLUMINATE <span>·</span> PINCH TO LOOK CLOSER';
  document.addEventListener('visibilitychange', () => {
    void audio.visibility(document.hidden);
  });
  // Read-only state for browser QA; no controls or private user data are exposed.
  Object.defineProperty(window, '__afterRain', {
    value: { state: () => forest.diagnostics() },
    configurable: true,
  });
  if (import.meta.hot) import.meta.hot.dispose(() => forest.dispose());
  void forest.start();
} catch (error) {
  fail(error);
}
