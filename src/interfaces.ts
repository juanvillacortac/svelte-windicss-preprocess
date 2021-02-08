export interface Node {
  start: number,
  end: number,
  type: string,
  value?: Text | Expression | ( Text | Expression)[],
}

export interface Attribute extends Node {
  type: 'Attribute',
  name: string,
  value: Text | Expression | ( Text | Expression)[],
}

export interface Directive extends Node {
  type: 'Directive',
  name: string,
  value: Text | Expression | ( Text | Expression)[],
}

export interface Expression extends Node {
  type: 'Expression',
  data: string
}

export interface Text extends Node {
  type: 'Text',
  data: string
}

export interface Tag {
  start: number,
  end: number,
  name: string,
  value: (Attribute | Directive)[]
}