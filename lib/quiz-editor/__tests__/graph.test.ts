import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  remapGraphIds, serializeGraph, setHandleTarget, toFlowEdges, toFlowNodes, validateGraph,
} from '../graph';
import type { Question, QuestionConnection } from '@/lib/types';
import type { AppNode } from '@/components/node-editor/EditorCanvas';

const base = {
  session_id: 'quiz', session_timer_seconds: null, created_at: '', updated_at: '',
  media_type: null, media_url: null, media_path: null, media_explanation: null,
};
const choice = (label: 'A' | 'B', text: string) => ({
  id: `c-${label}`, label, choice_text: text, score_impact: label === 'A' ? 10 : -5,
  explanation: `why ${label}`, behavior_meaning: `meaning ${label}`, clinical_tags: ['tag'],
});

const stored: Question[] = [
  {
    ...base, id: '11111111-1111-4111-8111-111111111111', question_order: 0, question_text: 'Q1',
    node_name: 'First', timer_override: 45, is_entry_point: true, node_x: 10, node_y: 20,
    node_type: 'normal', media_type: 'image', media_url: 'https://storage.googleapis.com/b/x.png',
    media_path: 'quiz-media/x.png', media_explanation: 'caption', choices: [choice('A', 'yes'), choice('B', 'no')],
  },
  {
    ...base, id: '22222222-2222-4222-8222-222222222222', question_order: 1, question_text: 'Scene',
    node_name: null, timer_override: null, is_entry_point: false, node_x: 300, node_y: 0,
    node_type: 'situation', media_explanation: 'Scene', choices: [],
  },
  {
    ...base, id: '33333333-3333-4333-8333-333333333333', question_order: 2, question_text: '',
    node_name: 'Ending', timer_override: null, is_entry_point: false, node_x: 600, node_y: 0,
    node_type: 'end', choices: [],
  },
];
const connections = [
  { id: 'x', session_id: 'quiz', from_question_id: stored[0].id, from_choice_label: 'A', to_question_id: stored[1].id },
  { id: 'y', session_id: 'quiz', from_question_id: stored[0].id, from_choice_label: 'B', to_question_id: stored[2].id },
] as QuestionConnection[];

test('loading then saving without edits preserves every stored field', () => {
  const body = serializeGraph(toFlowNodes(stored), toFlowEdges(connections));
  const pick = (q: Question) => ({
    id: q.id, question_order: q.question_order, question_text: q.question_text, node_name: q.node_name,
    media_type: q.media_type, media_url: q.media_url, media_explanation: q.media_explanation,
    media_path: q.media_path, is_entry_point: q.is_entry_point, node_x: q.node_x, node_y: q.node_y,
    node_type: q.node_type, timer_override: q.timer_override, choices: q.choices,
  });
  assert.deepEqual(body.questions, stored.map(pick));
  assert.deepEqual(body.connections, connections.map(({ from_question_id, from_choice_label, to_question_id }) =>
    ({ from_question_id, from_choice_label, to_question_id })));
});

test('a per-question timer survives a save', () => {
  const body = serializeGraph(toFlowNodes(stored), []);
  assert.equal(body.questions[0].timer_override, 45);
});

test('a new connection from a handle replaces the old one instead of duplicating it', () => {
  const edges = setHandleTarget(toFlowEdges(connections), stored[0].id, 'A', stored[2].id);
  const fromA = edges.filter((e) => e.source === stored[0].id && e.sourceHandle === 'A');
  assert.equal(fromA.length, 1);
  assert.equal(fromA[0].target, stored[2].id);
  assert.equal(edges.length, 2);
  assert.equal(setHandleTarget(edges, stored[0].id, 'A', null).length, 1);
});

test('validation allows an empty end message but requires one start node', () => {
  const nodes = toFlowNodes(stored);
  assert.equal(validateGraph(nodes), null);
  const noStart = nodes.map((n) => ({ ...n, data: { ...n.data, is_entry_point: false } }) as AppNode);
  assert.match(validateGraph(noStart) ?? '', /start node/);
  const twoStarts = nodes.map((n) => ({ ...n, data: { ...n.data, is_entry_point: n.type !== 'endNode' } }) as AppNode);
  assert.match(validateGraph(twoStarts) ?? '', /Only one/);
  assert.match(validateGraph([]) ?? '', /at least one node/);
});

test('validation still rejects blank question text and blank choices', () => {
  const nodes = toFlowNodes(stored);
  const blankQ = nodes.map((n, i) => (i === 0 ? { ...n, data: { ...n.data, question_text: ' ' } } : n) as AppNode);
  assert.match(validateGraph(blankQ) ?? '', /needs question/);
  const first = nodes[0];
  const blankChoice = [{ ...first, data: { ...first.data, choices: [{ ...choice('A', ''), explanation: '' }] } } as AppNode, ...nodes.slice(1)];
  assert.match(validateGraph(blankChoice) ?? '', /Choice A/);
});

test('remapping new editor ids keeps connections attached', () => {
  const nodes = [{ ...toFlowNodes(stored)[0], id: 'normalNode-1' }, ...toFlowNodes(stored).slice(1)] as AppNode[];
  const edges = setHandleTarget([], 'normalNode-1', 'A', stored[1].id);
  const remapped = remapGraphIds(nodes, edges, { 'normalNode-1': stored[0].id });
  assert.equal(remapped.nodes[0].id, stored[0].id);
  assert.equal(remapped.edges[0].source, stored[0].id);
  assert.equal(remapped.edges[0].id, `${stored[0].id}-A-${stored[1].id}`);
});
