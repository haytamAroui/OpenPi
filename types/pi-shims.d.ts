declare module "@earendil-works/pi-coding-agent" {
  export type ExtensionContext = any;
  export type ExtensionAPI = any;
  export const DynamicBorder: any;
  export function isToolCallEventType(...args: any[]): boolean;
  export function getMarkdownTheme(...args: any[]): any;
  export function getAgentDir(...args: any[]): any;
  export function parseFrontmatter<T = any>(...args: any[]): { frontmatter: T; body: string };
  export function withFileMutationQueue<T = any>(...args: any[]): Promise<T>;
}

declare module "@earendil-works/pi-tui" {
  export class Text {
    constructor(...args: any[]);
    setText(...args: any[]): any;
    render(...args: any[]): any;
    invalidate(...args: any[]): any;
  }
  export class Box {
    constructor(...args: any[]);
  }
  export class Markdown {
    constructor(...args: any[]);
  }
  export class Container {
    constructor(...args: any[]);
    addChild(...args: any[]): any;
    render(...args: any[]): any;
    invalidate(...args: any[]): any;
  }
  export class Spacer {
    constructor(...args: any[]);
  }
  export type AutocompleteItem = any;
  export const Key: any;
  export function matchesKey(...args: any[]): any;
  export function truncateToWidth(...args: any[]): any;
  export function visibleWidth(...args: any[]): any;
  export function getMarkdownTheme(...args: any[]): any;
}

declare module "@earendil-works/pi-ai" {
  export type AssistantMessage = any;
  export type Message = any;
  export function StringEnum(...args: any[]): any;
}

declare module "yaml" {
  export function parse(...args: any[]): any;
}

declare module "typebox" {
  export const Type: any;
}
