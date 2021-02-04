import MagicString from 'magic-string';
import { writeFileSync } from 'fs';
import { walk, parse } from 'svelte/compiler';
import { StyleSheet } from 'windicss/utils/style';
import { Processor } from 'windicss/lib';
import { CSSParser } from 'windicss/utils/parser';
import type { Config } from 'windicss/types/interfaces';
import type { TemplateNode } from 'svelte/types/compiler/interfaces'
import type { Preprocessor } from 'svelte/types/compiler/preprocess';

interface ChildNode {
  start:number;
  end:number;
  data:string;
  name?:string;
}

const DEV = process.env.NODE_ENV === 'development';

let PROCESSOR:Processor;
let VARIANTS:string[] = [];
let BUNDLEFILE:string;
let IGNORED_CLASSES:string[] = [];
let STYLESHEETS:StyleSheet[] = [];
let DIRECTIVES:StyleSheet[] = [];
let FILES:(string|undefined)[] = [];
let BUNDLES: {[key:string]:StyleSheet} = {};

let TAGNAMES:{[key:string]:string|undefined} = {};
let OPTIONS:{
  config?: Config | string,
  compile?: boolean,
  prefix?: string,
  bundle?: string,
  globalPreflight?: boolean,
  globalUtility?: boolean,
} = {
  compile: true,
  prefix: 'windi-',
  globalPreflight: true,
  globalUtility: true,
};

function combineStyleList(stylesheets:StyleSheet[]) {
  return stylesheets.reduce((previousValue, currentValue) => previousValue.extend(currentValue), new StyleSheet()).combine();//.sort();
}

function globalStyleSheet(styleSheet:StyleSheet) {
  // turn all styles in stylesheet to global style
  styleSheet.children.forEach(style=>{
    style.wrapRule((rule:string)=>`:global(${rule})`);
  });
  return styleSheet;
}

function compilation(classNames:string) {
  const utility = PROCESSOR.compile(classNames, OPTIONS.prefix, false);
  IGNORED_CLASSES = [...IGNORED_CLASSES, ...utility.ignored];
  STYLESHEETS.push(OPTIONS.globalUtility && !OPTIONS.bundle?globalStyleSheet(utility.styleSheet):utility.styleSheet);
  return utility.className ? [utility.className, ...utility.ignored].join(' ') : utility.ignored.join(' '); // return new className
}

function interpretation(classNames:string) {
  const utility = PROCESSOR.interpret(classNames);
  IGNORED_CLASSES = [...IGNORED_CLASSES, ...utility.ignored];
  let styleSheet = utility.styleSheet;
  STYLESHEETS.push(OPTIONS.globalUtility && !OPTIONS.bundle?globalStyleSheet(styleSheet):styleSheet);
}

function getReduceValue(node:TemplateNode, key="consequent"):TemplateNode|string|undefined {
  if (!node) return;
  const value = node[key];
  if (!value) return;
  if (value.raw) return value.value;
  return getReduceValue(value, key);
}

function addVariant(classNames:string, variant:string) {
  // prepend variant before each className
  const groupRegex = /[\S]+:\([\s\S]*?\)/g;
  const groups = [...classNames.match(groupRegex)??[]];
  const utilities = classNames.replace(groupRegex, '').split(/\s+/).filter(i=>i);
  return [...utilities, ...groups].map(i=>`${variant}:${i}`).join(' ');
}

const _preprocess:Preprocessor = ({content, filename}) => {
  const styleBlock = /<style[^>]*?(\/|(>([\s\S]*?)<\/style))>/;
  let updatedTags = [];
  let style = content.match(styleBlock)?.[0];
  if (style) {
    // handle tailwind directives ...
    style = style.replace(/<\/?style[^>]*>/g, '');
    STYLESHEETS.push(new CSSParser(style, PROCESSOR).parse());
    content = content.replace(styleBlock, '');
  }
  const parsed = parse(content);
  const code = new MagicString(content);
  
  walk(parsed.html, {
    enter(node:TemplateNode) {
      if (node.type === 'Element') {
        if (!TAGNAMES[node.name]) {
          TAGNAMES[node.name] = filename;
          updatedTags.push(node.name); // only work on production
        };
      
        let classes:string[] = [];
        let classStart:number|undefined;
        
        node.attributes.forEach((i:any)=>{
          if (i.name === 'class' || i.name === 'tw') {
            classStart = i.start;
            classes = [...classes, ...i.value.map(({data}:ChildNode)=>data)];
            code.overwrite(i.start, i.end, '');
          } else if (VARIANTS.includes(i.name)) {
            // handle variant properties
            classStart = i.start;
            classes = [...classes, ...i.value.map(({data}:ChildNode)=>addVariant(data, i.name === 'xxl' ? '2xl' : i.name))];
            code.overwrite(i.start, i.end, '');
          }
        });
    
        if (classStart) {
          if (OPTIONS.compile) {
            code.prependLeft(classStart, `class="${compilation(classes.join(' '))}"`);
          } else {
            interpretation(classes.join(' '));
            code.prependLeft(classStart, `class="${classes.join(' ')}"`);
          }
        }
      }

      if (node.type === 'Class') {
        // handle class directive
        const utility = PROCESSOR.interpret(node.name);
        IGNORED_CLASSES = [...IGNORED_CLASSES, ...utility.ignored];
        DIRECTIVES.push(utility.styleSheet);
        // make sure directives add after all classes.
      }

      if (node.type==="ConditionalExpression") {
        // handle inline conditional expression
        const utility = PROCESSOR.interpret(`${getReduceValue(node, 'consequent')} ${getReduceValue(node, 'alternate')}`);
        IGNORED_CLASSES = [...IGNORED_CLASSES, ...utility.ignored];
        DIRECTIVES.push(utility.styleSheet);
      }

    }
  });

  if (FILES.indexOf(filename) !== -1) {
    // hot reload
    for (let [key,value] of Object.entries(TAGNAMES)) {
      if (value === filename) updatedTags.push(key);
    }
  };

  // preflights might lost when refresh
  const preflights = PROCESSOR.preflight(content, true, FILES.length === 0 || FILES.indexOf(filename) === 0, true, !DEV);
  
  const styleSheet = ((OPTIONS.globalPreflight && !OPTIONS.bundle)? globalStyleSheet(preflights) : preflights)
                      .extend(combineStyleList(STYLESHEETS))
                      .extend(combineStyleList(DIRECTIVES));
  
  if (OPTIONS.bundle) {
    if (filename) BUNDLES[filename] = styleSheet;
    writeFileSync(OPTIONS.bundle, combineStyleList(Object.values(BUNDLES)).build(true));
  } else {
    code.trimEnd().append(`\n\n<style>\n${styleSheet.build()}</style>`);
  }

  if (!FILES.includes(filename)) FILES.push(filename);
  
  // clear lists until next call
  STYLESHEETS = [];
  DIRECTIVES = [];
  return {code: code.toString()};
}

function _optimize(types:string, typeNodes:{[key:string]:string}) {
  const parser = new CSSParser(types);
  writeFileSync(BUNDLEFILE, parser.parse().build(true));
}

export function preprocess(options: typeof OPTIONS = {}) {
  OPTIONS = {...OPTIONS, ...options}; // change global settings here;
  PROCESSOR = new Processor(OPTIONS.config);
  VARIANTS = [...Object.keys(PROCESSOR.resolveVariants()), 'xxl'];
  return _preprocess;
}

export function optimize(path:string) {
  BUNDLEFILE = path;
  return _optimize;
}