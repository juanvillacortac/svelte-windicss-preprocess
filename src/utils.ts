import Processor from 'windicss';
import { CSSParser } from 'windicss/utils/parser';
import { StyleSheet } from 'windicss/utils/style';
import { readFileSync } from "fs";
import type { Options } from "./index";
import type { FullConfig } from "windicss/types/interfaces";
import { format, RequiredOptions } from "prettier"
import { performance } from "perf_hooks";

export function combineStyleList(stylesheets: StyleSheet[]) {
  return stylesheets
    .reduce((previousValue, currentValue) => previousValue.extend(currentValue), new StyleSheet())
    .combine(); //.sort();
}

export function globalStyleSheet(styleSheet: StyleSheet) {
  // turn all styles in stylesheet to global style
  styleSheet.children.forEach(style => {
    if (!style.rule.includes(':global') && style.meta.group !== 'keyframes') {
      style.wrapRule((rule: string) => `:global(${rule})`);
    }
    if (style.atRules && !style.atRules.includes('-global-') && style.meta.group == "keyframes") {
      style.atRules[0] = style.atRules[0].replace(/(?<=keyframes )(?=\w)/gi, "-global-")
    }
  });
  return styleSheet;
}

export function chalkColor() {
  const chalk = require('chalk');
  return {
    blueBold: (text: string) => chalk.hex('#0ea5e9').bold(text),
    blackBold: (text: string) => chalk.hex('#000').bold(text),
    yellowBold: (text: string) => chalk.hex('#FFB11B').bold(text),
    redBold: (text: string) => chalk.hex('#FF4000').bold(text),
    green: (text: string) => chalk.hex('#00D17A')(text),
    gray: (text: string) => chalk.hex('#717272')(text),
  };
}

export function logging(options: Options) {
  const chalk = chalkColor();
  process.stdout.write(`${chalk.blueBold('')}\n`);
  process.stdout.write(`${chalk.blueBold('│')} ${chalk.blueBold('svelte-windicss-preprocess')}\n`);
  process.stdout.write(
    `${chalk.blueBold('│')} ${process.env.NODE_ENV == undefined ? chalk.redBold('NODE_ENV is undefined') : ''}\n`
  );
  process.stdout.write(
    `${chalk.blueBold('│')} ${chalk.blackBold('-')} windicss running mode: ${process.env.NODE_ENV === 'development'
      ? chalk.yellowBold('dev')
      : process.env.NODE_ENV === 'production'
        ? chalk.green('prod')
        : chalk.yellowBold('process.env.NODE_ENV check failed (check setup)')
    }\n`
  );
  process.stdout.write(
    `${chalk.blueBold('│')} ${chalk.blackBold('-')} advanced debug logs: ${options?.debug === true ? chalk.yellowBold('on') : chalk.green('off')
    }\n`
  );

  process.stdout.write(
    `${chalk.blueBold('│')}    ${chalk.blackBold('•')} compilation mode: ${options?.compile == true ? chalk.gray('enabled') : chalk.gray('disabled')
    }\n`
  );
  process.stdout.write(
    `${chalk.blueBold('│')}    ${chalk.blackBold('•')} class prefix: ${options?.prefix ? chalk.gray(options.prefix) : chalk.yellowBold('not set')
    }\n`
  );

  process.stdout.write(`${chalk.blueBold('│')}\n`);
  process.stdout.write(`${chalk.blueBold('└──────────')}\n`);
}


class Step {
  processor: Processor
  content: string
  filename: string
  windiClassList: string[] = []
  directiveClassList: string[] = []
  attributifyClassList: Map<string, string[]> = new Map()
  mainClassList: string[] = []
  constructor(processor: Processor, content: string, filename: string) {
    this.processor = processor
    this.content = content
    this.filename = filename
    // TODO: Debug utils lib
  }

  processWindiExpression() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    // let WINDI_EXPRESSION = lines[i].toString().match(/windi\`(.*?)\`/i);
    // if (WINDI_EXPRESSION) {
    //   const INTERPRETED_WINDI_EXPRESSION = PROCESSOR.interpret(WINDI_EXPRESSION[1]);
    // }

    return this
  }

  processDirectiveClass() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content
    const DIRECTIVE_CLASS_MATCHES = [...tmpContent.matchAll(/\s(class):([^=]+)(=)/gi)];
    if (DIRECTIVE_CLASS_MATCHES.length < 1) return this
    for (const match of DIRECTIVE_CLASS_MATCHES) {
      this.directiveClassList.push(match[2])
    }

    this.content = tmpContent
    return this
  }

  processAttributify() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib


    // FIXME: not bulletprof yet

    let tmpContent = this.content
    const ATTRIBUTIFY_CLASS_MATCHES = [...tmpContent.matchAll(/([\w+:_/-]+)=(['"])([!\w\s\n~:/\\,%#\[\].$-]*?)\2/gi)];
    // TODO: allow prefix with ::
    // extract key & value as class array
    if (ATTRIBUTIFY_CLASS_MATCHES.length < 1) return this
    for (const match of ATTRIBUTIFY_CLASS_MATCHES) {
      if (match[1] == "class") continue
      this.attributifyClassList.set(match[1].toString(), match[3].split(' '))
    }

    this.content = tmpContent
    return this
  }

  processClassAttribute() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content
    const CLASS_MATCHES = [...tmpContent.matchAll(/(class)=(['"])([^\2]*?)\2/gi)];
    if (CLASS_MATCHES.length < 1) return this
    for (const match of CLASS_MATCHES) {
      let cleanedMatch = match[3]
        .replace(/windi[`].+?[`]|(?<![-])[$](?=[{])|(?<=([{][\w\s]+[^{]*?))['":]|([{][\w\s]+[^{]*?[\?])|^[{]|(?<=["'`)])[}]/gi, ' ')
        .replace(/ {2,}/gi, ' ')
      this.mainClassList = cleanedMatch.split(' ')
    }

    this.content = tmpContent
    return this
  }

  compute(compile: boolean = false) {
    // TODO: ERROR HANDLING
    // TODO: debug utils

    return {
      line: this.content,
      expressions: this.windiClassList,
      directives: this.directiveClassList,
      attributifies: this.attributifyClassList,
      classes: this.mainClassList
    }
  }
}

interface customPrettierOptions extends Partial<RequiredOptions> {
  svelteSortOrder: string,
  svelteStrictMode: boolean
  svelteAllowShorthand: boolean,
  svelteBracketNewLine: boolean
  svelteIndentScriptAndStyle: boolean
}

export class Magician {
  processor: Processor
  content: string
  filename: string
  isBundled: boolean = false
  isCompiled: boolean = false
  lines: string[] = []
  expressions: string[] = []
  directives: string[] = []
  attributifies: Map<string, string[]> = new Map()
  classes: string[] = []
  stylesheets: StyleSheet[] = []
  config: FullConfig = {}
  stats: Record<string, any> = {}
  computedStyleSheet: StyleSheet = new StyleSheet()
  css: string = ""

  constructor(processor: Processor, content: string, filename: string, config?: FullConfig = {}) {
    this.processor = processor
    this.content = content
    this.filename = filename
    this.config = config
    // TODO: Debug utils lib
  }

  getStats() {
    return this.stats
  }

  clean() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content
    // FIXME: needs to be refactored. shouldn't remove comments completly, just for parsing
    tmpContent = tmpContent.replace(/<!--[\s\S]*?-->/g, '');
    tmpContent = tmpContent.replace(/([!\w][\w:_/-]*?):\(([\w\s/-]*?)\)/gm, (_, groupOne: string, groupTwo: string) =>
      groupTwo
        .split(/\s/g)
        .map(cssClass => `${groupOne}:${cssClass}`)
        .join(' ')
    );

    this.content = tmpContent
    return this
  }

  format() {
    // TODO: ERROR HANDLING
    // TODO: better formatting.. no upstream fix of prettier-plugin expected soon
    // https://github.com/sveltejs/prettier-plugin-svelte/issues/214
    // TODO: Debug utils lib

    let start = performance.now()
    let tmpContent = this.content

    tmpContent = tmpContent.replace(/(?<=[\<]{1}\w[^\>]+)\n/gmi, " ")

    let options: customPrettierOptions = {
      parser: 'svelte',
      plugins: ['prettier-plugin-svelte'],
      printWidth: 5000,
      tabWidth: 2,
      svelteSortOrder: 'options-scripts-markup-styles',
      svelteStrictMode: true,
      svelteAllowShorthand: false,
      svelteBracketNewLine: false,
      svelteIndentScriptAndStyle: false,
    }
    let formatedContent = format(tmpContent, options);

    this.content = formatedContent
    let end = performance.now()
    this.stats.prettierFormat = (end - start).toFixed(2) + "ms"

    return this
  }

  extractStyle() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content
    let start = performance.now()
    this.css = ""
    let style = tmpContent.match(/<style[^>]*?(\/|(>([\s\S]*?)<\/style))>/)?.[0];
    if (style) {
      // var global = style.match(/\<style global\>/gi);
      var openTag = style.match(/<style[^>]*?>/gi)?.[0] || "<style>";
      this.css = style.replace(/<\/?style[^>]*>/g, '');
      // if (global) {
      //   this.stylesheets.push(this.useGlobal(new CSSParser(css, this.processor).parse()));
      // } else {
      //   this.stylesheets.push(new CSSParser(css, this.processor).parse());
      // }
      tmpContent = tmpContent.replace(/<style[^>]*?(\/|(>([\s\S]*?)<\/style))>/g, `${openTag}</style>`);
      tmpContent = tmpContent.replace("<style", "<style windi:inject")
    } else {
      tmpContent += "\n\n<style windi:inject></style>"
    }

    this.content = tmpContent

    let end = performance.now()
    this.stats.styleTag = (end - start).toFixed(2) + "ms"
    return this
  }

  each(callbackfn: (line: Step) => {
    line: string,
    expressions: string[],
    directives: string[],
    attributifies: Map<string, string[]>,
    classes: string[]
  }) {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content

    this.lines = tmpContent.split('\n');
    this.lines.forEach(el => {
      // let result
      const { line, expressions, directives, attributifies, classes } = callbackfn(new Step(this.processor, el, this.filename))
      el = line
      this.expressions = this.expressions.concat(expressions)
      this.directives = this.directives.concat(directives)
      attributifies.forEach((v, k) => {
        if (this.attributifies.has(k)) {
          let oldValue = this.attributifies.get(k)
          if (oldValue) {
            this.attributifies.set(k, oldValue.concat(v))
          }
        } else {
          this.attributifies.set(k, v)
        }
      })
      this.classes = this.classes.concat(classes)
      // this.stylesheets = this.stylesheets.concat(sheets)
    })
    this.attributifies.forEach((v, k) => {
      let unique = new Set(v)
      this.attributifies.set(k, Array.from(unique))
    })
    tmpContent = this.lines.join('\n');
    this.content = tmpContent

    return this
  }

  compute() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    let tmpContent = this.content

    // TODO: WINDI EXPRESSION
    // let INTERPRETED_WINDI = this.processor.interpret(this.mainClassList.join(' ')).styleSheet


    let directiveSet = new Set(this.directives)
    // console.log(directiveSet);
    let INTERPRETED_DIRECTIVE = this.processor.interpret(Array.from(directiveSet).join(' ')).styleSheet

    // console.log(this.attributifies);
    let startA = performance.now()
    let INTERPRETED_ATTRIBUTIFY = this.processor.attributify(Object.fromEntries(this.attributifies)).styleSheet
    let endA = performance.now()
    this.stats.computeAttributify = (endA - startA).toFixed(2) + "ms"

    let classSet = new Set(this.classes)
    // console.log(classSet)
    let startC = performance.now()
    let INTERPRETED_MAIN = this.processor.interpret(Array.from(classSet).join(' ')).styleSheet
    let endC = performance.now()
    this.stats.computeClasslist = (endC - startC).toFixed(2) + "ms"

    // windiexpression
    this.stylesheets.push(INTERPRETED_DIRECTIVE)
    this.stylesheets.push(INTERPRETED_ATTRIBUTIFY)
    this.stylesheets.push(INTERPRETED_MAIN)
    this.computedStyleSheet = combineStyleList(this.stylesheets).sort()
    // let finalStyleSheet = this.useGlobal(tmp)
    // let finalStyleSheet = tmp

    // let startB = performance.now()

    // // tmpContent = tmpContent.replace(/\<\/style\>/, `\n${finalStyleSheet.build()}\n</style>\n`)
    // // tmpContent += `\n\n<style>\n${finalStyleSheet.build()}\n</style>\n`;

    // let endB = performance.now()
    // this.stats.buildStyleSheet = (endB - startB).toFixed(2) + "ms"

    // TODO: validation of timing function
    // let startD = performance.now()
    // const end = Date.now() + 25
    // while (Date.now() < end) continue
    // let endD = performance.now()
    // this.stats.v = (endD - startD).toFixed(2) + "ms"

    this.content = tmpContent
    return this
  }

  useDevTools() {
    // TODO: ERROR HANDLING

    let tmpContent = this.content
    const path = require.resolve("windicss-runtime-dom");
    let runtimeConfig: FullConfig = {
      theme: this.config.theme
    }
    let windiRuntimeDom = readFileSync(path, "utf-8");
    let windiRuntimeDomConfig = `
        window.windicssRuntimeOptions = {
          extractInitial: false,
          preflight: false,
          mockClasses: true,
          config: ${JSON.stringify(runtimeConfig)}
        }
      `
    let injectScript = `
        if (!document.getElementById("windicss-devtools")) {
          const script = document.createElement("script");
          script.id = "windicss-devtools";
          script.setAttribute("type", "text/javascript");
          script.innerHTML = ${JSON.stringify(windiRuntimeDomConfig + windiRuntimeDom)};
          document.head.append(script);
        }
      `;

    let script = tmpContent.match(/<script[^>]*?(\/|(>([\s\S]*?)<\/script))>/)?.[0]
    if (script) {
      tmpContent = tmpContent.replace(/\<script\>/, `<script>\n${injectScript}`)
    } else {
      tmpContent += `\n\n<script>${injectScript}</script>\n\n`;
    }

    this.content = tmpContent
    return this
  }

  getCode() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    return this.content
  }

  getComputed() {
    return this.computedStyleSheet
  }

  getExtracted() {
    return this.css
  }

  getFilename() {
    // TODO: ERROR HANDLING
    // TODO: Debug utils lib

    return this.filename
  }
}
