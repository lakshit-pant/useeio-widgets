import { Widget } from "./widget";
import { isNone } from "./util/util";
import { Config, parseConfig, serializeConfig } from "./config";

/**
 * With a `ConfigTransmitter` it is possible to share configuration updates
 * between multiple widgets. When a widget joins a transmitter, it receives
 * configuration updates of the transmitter. Also, a transmitter listens to
 * configuration updates of a widget and shares these updates with the other
 * widgets that joined the transmitter.
 */
abstract class ConfigTransmitter {

    protected readonly widgets = new Array<Widget>();
    protected config: Config = {};
    protected defaultConfig: Config;

    /**
     * Returns a copy of the current configuration of this transmitter
     * including possible default values..
     */
    public get(): Config {
        return !this.defaultConfig
            ? { ...this.config }
            : { ...this.defaultConfig, ...this.config };
    }

    /**
     * Set the default configuration options of this transmitter. The default
     * values are not serialized, e.g. when updating the hash value of an URL,
     * but are passed to joined widgets. The default configuration should be set
     * before widgets join this transmitter.
     */
    withDefaults(input: Config | string) {
        if (!input)
            return;
        const config = typeof input === "string"
            ? parseConfig(input)
            : input;
        this.defaultConfig = config;
    }

    /**
     * Let the given widget join this configuration transmitter. The widget will
     * be initialized with the current configuration of this transmitter.
     */
    join(widget: Widget) {
        if (!widget) {
            return;
        }
        this.widgets.push(widget);
        widget.update(this.get());
        widget.onChanged(change => {
            this.update(change);
        });
    }

    /**
     * Updates all widgets that joined this transmitter with the given
     * configuration.
     */
    update(input: Config | string) {
        if (!input)
            return;
        const change = typeof input === "string"
            ? parseConfig(input)
            : input;
        const current: Config = this.get();
        this.config = { ...current, ...change };
        for (const widget of this.widgets) {
            widget.update(this.config);
        }
    }

    /**
     * Updates the configation of this transmitter if the given object contains
     * properties that are not already defined. Only if there is at least one
     * such property, an update is fired.
     */
    updateIfAbsent(input: Config | string) {
        if (!input)
            return;
        const config = typeof input === "string"
            ? parseConfig(input)
            : input;

        let shouldUpdate = false;
        const current: Config = this.get();
        for (const key of Object.keys(config)) {
            const updateValue = config[key];
            if (isNone(updateValue)) {
                continue;
            }
            const currentValue = current[key];
            if (isNone(currentValue)) {
                current[key] = updateValue;
                shouldUpdate = true;
            }
        }

        if (shouldUpdate) {
            this.update(current);
        }
    }

    /**
     * Returns the serialized string of the current configuration of this
     * transmitter. Note that if default configuration options were set via the
     * `withDefaults` method, these default options are not inculded in the
     * seriualized form.
     */
    serialize(): string {
        if (!this.config) {
            return "";
        }
        if (!this.defaultConfig) {
            return serializeConfig(this.config);
        }

        // we use this isEqual test to decide whether we need to serialize an
        // attribute of the configuration or not. we do not serialze it if it
        // the config-value is equal to the default value.
        const isEqual = (v1: any, v2: any): boolean => {
            if (v1 === v2) {
                return true;
            }
            if (Array.isArray(v1) && Array.isArray(v2)) {
                let arraysEqual = v1.length === v2.length;
                if (!arraysEqual) {
                    return false;
                }
                for (const elem of v1) {
                    if (!v2.includes(elem)) {
                        arraysEqual = false;
                        break;
                    }
                }
                return arraysEqual;
            }
            return false;
        };

        const nonDefaults: Config = {};
        const keys = Object.keys(this.defaultConfig)
            .concat(Object.keys(this.config));
        for (const key of keys) {
            const defaultVal = this.defaultConfig[key];
            const configVal = this.config[key];
            if (isEqual(defaultVal, configVal)) {
                continue;
            }
            nonDefaults[key] = configVal;
        }
        return serializeConfig(nonDefaults);
    }
}

/**
 * A simple `ConfigTransmitter` implementation that shares configuration
 * updates with the joined widgtes.
 */
export class SimpleConfigTransmitter extends ConfigTransmitter {
}

/**
 * A `ConfigTransmitter` implementation that reads and serializes
 * its configuration state from and to the hash part of the current
 * URL.
 */
export class UrlConfigTransmitter extends ConfigTransmitter {
    private initialHash: string;
    private stateValue: string | null;
    private debug = true;

    constructor() {
        super();
        // Store initial hash and state
        this.initialHash = window.location.hash;
        this.stateValue = this.getStateFromHash(this.initialHash);

        // Initialize config without scripts to prevent overwrites
        const config = this.parseUrlConfig({ withScripts: false });
        
        // Set initial state in config
        if (this.stateValue) {
            config.state = this.stateValue;
        }
        
        this.config = config;

        // Prevent hash changes from removing state
        window.addEventListener('hashchange', (e) => {
            const newHash = window.location.hash;
            if (!newHash.includes(`state=${this.stateValue}`)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);
    }

    update(input: Config | string) {
        // Don't update if we have state parameter
        if (this.stateValue) {
            return;
        }
        super.update(input);
    }

    private getStateFromHash(hash: string): string | null {
        const stateMatch = hash.match(/state=([^&#+]+)/);
        return stateMatch ? stateMatch[1] : null;
    }

    // Prevent serialization if state exists
    serialize(): string {
        if (this.stateValue) {
            return `state=${this.stateValue}`;
        }
        return super.serialize();
    }

    private parseUrlConfig(what?: { withScripts?: boolean }): Config {
        const urls: string[] = [window.location.href];
        let config: Config = {};
        
        for (const url of urls) {
            const hashParams = parseConfig(this.getHashPart(url));
            const otherParams = parseConfig(this.getParameterPart(url));
            config = { ...config, ...otherParams, ...hashParams };
        }
        
        return config;
    }

    private onHashChanged() {
        if (window.location.hash.includes('state=')) {
            return;
        }
        this.config = this.parseUrlConfig();
        const config = this.get(); // add possible defaults
        for (const widget of this.widgets) {
            widget.update(config);
        }
    }

    private getHashPart(url: string): string | null {
        if (!url) return null;
        const parts = url.split("#");
        return parts.length < 2 ? null : parts[parts.length - 1];
    }

    private getParameterPart(url: string): string | null {
        if (!url) return null;
        let part = url;
        let parts = url.split("#");
        if (parts.length > 1) {
            part = parts[parts.length - 2];
        }
        parts = part.split("?");
        return parts.length < 2 ? null : parts[1];
    }
}

export class HtmlAttributeConfigTransmitter extends ConfigTransmitter {

    private readonly element: HTMLElement;
    private readonly attribute: string;

    constructor(elementSelector: string, attribute: string) {
        super();
        this.element = document.querySelector(elementSelector);
        this.attribute = attribute;
        if (this.element) {

            // initialize the configuration of this transmitter with
            // the current attribute value
            const attributeValue = this.element.getAttribute(attribute);
            if (attributeValue) {
                this.config = parseConfig(attributeValue);
            }

            // observe attribute changes
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    if (mutation.attributeName === attribute) {
                        const value = this.element.getAttribute(attribute);
                        this.config = parseConfig(value);
                        const updated = this.get();  // include defaults
                        for (const widget of this.widgets) {
                            widget.update(updated);
                        }
                    }
                });
            });
            observer.observe(this.element, {
                attributeFilter: [attribute],
            });

        }
    }

    update(input: Config | string) {
        if (!this.element) {
            super.update(input);
            return;
        }
        const patch = typeof input === "string"
            ? parseConfig(input)
            : input;
        this.config = { ...this.config, ...patch };
        const currentVal = this.element.getAttribute(this.attribute);
        const nextVal = this.serialize();
        if (currentVal !== nextVal) {
            this.element.setAttribute(this.attribute, nextVal);
        }
    }

}
