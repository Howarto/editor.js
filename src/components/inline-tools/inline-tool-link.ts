import SelectionUtils from '../selection';

import $ from '../dom';
import * as _ from '../utils';
import { EditorConfig, InlineTool, SanitizerConfig } from '../../../types';
import { Notifier, Toolbar, I18n } from '../../../types/api';

/**
 * Link Tool
 *
 * Inline Toolbar Tool
 *
 * Wrap selected text with <a> tag
 */
export default class LinkInlineTool implements InlineTool {
  /**
   * Specifies Tool as Inline Toolbar Tool
   *
   * @returns {boolean}
   */
  public static isInline = true;

  /**
   * Title for hover-tooltip
   */
  public static title = 'Link';

  /**
   * Sanitizer Rule
   * Leave <a> tags
   *
   * @returns {object}
   */
  public static get sanitize(): SanitizerConfig {
    return {
      a: {
        href: true,
        title: true,
      },
    } as SanitizerConfig;
  }

  /**
   * Native Document's commands for link/unlink
   */
  private readonly commandLink: string = 'createLink';
  private readonly commandUnlink: string = 'unlink';

  /**
   * Enter key code
   */
  private readonly ENTER_KEY: number = 13;

  /**
   * Styles
   */
  private readonly CSS = {
    button: 'ce-inline-tool',
    buttonActive: 'ce-inline-tool--active',
    buttonModifier: 'ce-inline-tool--link',
    buttonUnlink: 'ce-inline-tool--unlink',
    input: 'ce-inline-tool-input',
    inputShowed: 'ce-inline-tool-input--showed',
  };

  /**
   * Elements
   */
  private nodes: {
    button: HTMLButtonElement;
    inputs: {
      root: HTMLElement;
      link: HTMLInputElement;
      title: HTMLInputElement;
    };
  } = {
    button: null,
    inputs: null,
  };

  /**
   * SelectionUtils instance
   */
  private selection: SelectionUtils;

  /**
   * Input opening state
   */
  private inputOpened = false;

  /**
   * Available Toolbar methods (open/close)
   */
  private toolbar: Toolbar;

  /**
   * Available inline toolbar methods (open/close)
   */
  private inlineToolbar: Toolbar;

  /**
   * Notifier API methods
   */
  private notifier: Notifier;

  /**
   * I18n API
   */
  private i18n: I18n;

  /**
   * EditorJS configuration
   */
  private config: {
    linkSuggestions?: string[];
  };

  /**
   * @param {API} api - Editor.js API
   */
  constructor({ api, config }) {
    this.toolbar = api.toolbar;
    this.inlineToolbar = api.inlineToolbar;
    this.notifier = api.notifier;
    this.i18n = api.i18n;
    this.selection = new SelectionUtils();
    this.config = config;
  }

  /**
   * Create button for Inline Toolbar
   */
  public render(): HTMLElement {
    this.nodes.button = document.createElement('button') as HTMLButtonElement;
    this.nodes.button.type = 'button';
    this.nodes.button.classList.add(this.CSS.button, this.CSS.buttonModifier);
    this.nodes.button.appendChild($.svg('link', 14, 10));
    this.nodes.button.appendChild($.svg('unlink', 15, 11));

    return this.nodes.button;
  }

  /**
   * Input for the link
   */
  public renderActions(): HTMLElement {
    const link = document.createElement('input');

    link.placeholder = this.i18n.t('Add a link');
    link.classList.add(this.CSS.input);
    link.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.keyCode === this.ENTER_KEY) {
        this.enterPressed(event);
      }
    });
    link.setAttribute('list', 'linkSuggestions');

    const datalist = document.createElement('datalist');

    datalist.id = 'linkSuggestions';

    if (this.config.linkSuggestions?.length > 0) {
      this.config.linkSuggestions.forEach((suggestion) => {
        const option = document.createElement('option');

        option.textContent = suggestion;
        datalist.appendChild(option);
      });
    }

    const title = document.createElement('input');

    title.placeholder = this.i18n.t('Add a title');
    title.classList.add(this.CSS.input);
    title.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.keyCode === this.ENTER_KEY) {
        this.enterPressed(event);
      }
    });

    const root = document.createElement('div');

    root.append(link, datalist, title);

    this.nodes.inputs = {
      root,
      link,
      title,
    };

    return this.nodes.inputs.root;
  }

  /**
   * Handle clicks on the Inline Toolbar icon
   *
   * @param {Range} range - range to wrap with link
   */
  public surround(range: Range): void {
    /**
     * Range will be null when user makes second click on the 'link icon' to close opened input
     */
    if (range) {
      /**
       * Save selection before change focus to the input
       */
      if (!this.inputOpened) {
        /** Create blue background instead of selection */
        this.selection.setFakeBackground();
        this.selection.save();
      } else {
        this.selection.restore();
        this.selection.removeFakeBackground();
      }
      const parentAnchor = this.selection.findParentTag('A');

      /**
       * Unlink icon pressed
       */
      if (parentAnchor) {
        this.selection.expandToTag(parentAnchor);
        this.unlink();
        this.closeActions();
        this.checkState();
        this.toolbar.close();

        return;
      }
    }

    this.toggleActions();
  }

  /**
   * Check selection and set activated state to button if there are <a> tag
   *
   * @param {Selection} selection - selection to check
   */
  public checkState(selection?: Selection): boolean {
    const anchorTag = this.selection.findParentTag('A');

    if (anchorTag) {
      this.nodes.button.classList.add(this.CSS.buttonUnlink);
      this.nodes.button.classList.add(this.CSS.buttonActive);
      this.openActions();

      /**
       * Fill input value with link href
       */
      const hrefAttr = anchorTag.getAttribute('href');
      const titleAttr = anchorTag.getAttribute('title');

      this.nodes.inputs.link.value = hrefAttr !== 'null' ? hrefAttr : '';
      this.nodes.inputs.title.value = titleAttr !== 'null' ? titleAttr : '';

      this.selection.save();
    } else {
      this.nodes.button.classList.remove(this.CSS.buttonUnlink);
      this.nodes.button.classList.remove(this.CSS.buttonActive);
    }

    return !!anchorTag;
  }

  /**
   * Function called with Inline Toolbar closing
   */
  public clear(): void {
    this.closeActions();
  }

  /**
   * Set a shortcut
   */
  public get shortcut(): string {
    return 'CMD+K';
  }

  /**
   * Show/close link input
   */
  private toggleActions(): void {
    if (!this.inputOpened) {
      this.openActions(true);
    } else {
      this.closeActions(false);
    }
  }

  /**
   * @param {boolean} needFocus - on link creation we need to focus input. On editing - nope.
   */
  private openActions(needFocus = false): void {
    this.nodes.inputs.root.classList.add(this.CSS.inputShowed);

    this.nodes.inputs.link.classList.add(this.CSS.inputShowed);
    if (needFocus) {
      this.nodes.inputs.link.focus();
    }

    this.nodes.inputs.title.classList.add(this.CSS.inputShowed);

    this.inputOpened = true;
  }

  /**
   * Close input
   *
   * @param {boolean} clearSavedSelection — we don't need to clear saved selection
   *                                        on toggle-clicks on the icon of opened Toolbar
   */
  private closeActions(clearSavedSelection = true): void {
    if (this.selection.isFakeBackgroundEnabled) {
      // if actions is broken by other selection We need to save new selection
      const currentSelection = new SelectionUtils();

      currentSelection.save();

      this.selection.restore();
      this.selection.removeFakeBackground();

      // and recover new selection after removing fake background
      currentSelection.restore();
    }

    this.nodes.inputs.root.classList.remove(this.CSS.inputShowed);
    this.nodes.inputs.link.classList.remove(this.CSS.inputShowed);
    this.nodes.inputs.title.classList.remove(this.CSS.inputShowed);
    this.nodes.inputs.link.value = '';
    this.nodes.inputs.title.value = '';
    if (clearSavedSelection) {
      this.selection.clearSaved();
    }
    this.inputOpened = false;
  }

  /**
   * Enter pressed on input
   *
   * @param {KeyboardEvent} event - enter keydown event
   */
  private enterPressed(event: KeyboardEvent): void {
    let link = this.nodes.inputs.link.value || '';
    const title = this.nodes.inputs.title.value || '';

    if (!link.trim()) {
      this.selection.restore();
      this.unlink();
      event.preventDefault();
      this.closeActions();

      return;
    }

    if (!this.validateURL(link)) {
      this.notifier.show({
        message: 'Pasted link is not valid.',
        style: 'error',
      });

      _.log('Incorrect Link pasted', 'warn', link);

      return;
    }

    link = this.prepareLink(link);

    this.selection.restore();
    this.selection.removeFakeBackground();

    this.insertLink(link, title);

    /**
     * Preventing events that will be able to happen
     */
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.selection.collapseToEnd();
    this.inlineToolbar.close();
  }

  /**
   * Detects if passed string is URL
   *
   * @param {string} str - string to validate
   * @returns {boolean}
   */
  private validateURL(str: string): boolean {
    /**
     * Don't allow spaces
     */
    return !/\s/.test(str);
  }

  /**
   * Process link before injection
   * - sanitize
   * - add protocol for links like 'google.com'
   *
   * @param {string} link - raw user input
   */
  private prepareLink(link: string): string {
    link = link.trim();
    link = this.addProtocol(link);

    return link;
  }

  /**
   * Add 'http' protocol to the links like 'vc.ru', 'google.com'
   *
   * @param {string} link - string to process
   */
  private addProtocol(link: string): string {
    /**
     * If protocol already exists, do nothing
     */
    if (/^(\w+):(\/\/)?/.test(link)) {
      return link;
    }

    /**
     * We need to add missed HTTP protocol to the link, but skip 2 cases:
     *     1) Internal links like "/general"
     *     2) Internal root links like "/"
     *     3) Anchors looks like "#results"
     *     4) Protocol-relative URLs like "//google.com"
     *     4) Escaped URLs like "[content]"
     */
    const isInternal = /^\/[^/\s]/.test(link),
        isInternalRoot = link.length === 1 && link[0] === '/',
        isAnchor = link.substring(0, 1) === '#',
        isProtocolRelative = /^\/\/[^/\s]/.test(link),
        isEscapedUrl = /^\[.+\]$/.test(link);

    if (!isInternal && !isInternalRoot && !isAnchor && !isProtocolRelative && !isEscapedUrl) {
      link = 'http://' + link;
    }

    return link;
  }

  /**
   * Inserts <a> tag with "href"
   *
   * @param {string} link - "href" value
   * @param {string} title - "title" title
   */
  private insertLink(link: string, title: string): void {
    /**
     * Edit all link, not selected part
     */
    const anchorTag = this.selection.findParentTag('A');

    if (anchorTag) {
      this.selection.expandToTag(anchorTag);
    }

    document.execCommand(this.commandLink, false, link);
    /**
     * Get the selection again due to 'execCommand' replaced
     * the previous element.
     */
    this.selection.findParentTag('A').title = title;
  }

  /**
   * Removes <a> tag
   */
  private unlink(): void {
    document.execCommand(this.commandUnlink);
  }
}
