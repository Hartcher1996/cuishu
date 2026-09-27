export namespace main {
	
	export class Book {
	    title: string;
	    suffix: string;
	    category: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.suffix = source["suffix"];
	        this.category = source["category"];
	        this.path = source["path"];
	    }
	}
	export class CategoryGroup {
	    name: string;
	    books: Book[];
	
	    static createFrom(source: any = {}) {
	        return new CategoryGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.books = this.convertValues(source["books"], Book);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EdgeVoice {
	    name: string;
	    shortName: string;
	    gender: string;
	    locale: string;
	    localName: string;
	
	    static createFrom(source: any = {}) {
	        return new EdgeVoice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.shortName = source["shortName"];
	        this.gender = source["gender"];
	        this.locale = source["locale"];
	        this.localName = source["localName"];
	    }
	}
	export class ttsSettings {
	    rate: number;
	    engine: string;
	    edgeVoice: string;
	    webVoice: string;
	
	    static createFrom(source: any = {}) {
	        return new ttsSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rate = source["rate"];
	        this.engine = source["engine"];
	        this.edgeVoice = source["edgeVoice"];
	        this.webVoice = source["webVoice"];
	    }
	}

}

