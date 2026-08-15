(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
	[397], {
		2492: (e, t, r) => {
			"use strict";r.d(t, {
				w: () => s
			});
			let n = ["Ivan Ivanov", "Arsen Zholaman", "Valensiya Makridina", "Ali Beisembek", "Meirkhan Kairbekov", "Rustam Yersainov", "Suleiman Maxutov"];

			function s(e, t) {
				if(!e || !t) return !1;
				let r = "".concat(e.trim(), " ").concat(t.trim()).toLowerCase();
				return n.map(e => e.toLowerCase()).includes(r)
			}
		},
		3435: (e, t, r) => {
			"use strict";r.d(t, {
				k5: () => u
			});
			var n = r(2115),
				s = {
					color: void 0,
					size: void 0,
					className: void 0,
					style: void 0,
					attr: void 0
				},
				a = n.createContext && n.createContext(s),
				l = ["attr", "size", "title"];

			function c() {
				return(c = Object.assign ? Object.assign.bind() : function(e) {
					for(var t = 1; t < arguments.length; t++) {
						var r = arguments[t];
						for(var n in r) Object.prototype.hasOwnProperty.call(r, n) && (e[n] = r[n])
					}
					return e
				}).apply(this, arguments)
			}

			function o(e, t) {
				var r = Object.keys(e);
				if(Object.getOwnPropertySymbols) {
					var n = Object.getOwnPropertySymbols(e);
					t && (n = n.filter(function(t) {
						return Object.getOwnPropertyDescriptor(e, t).enumerable
					})), r.push.apply(r, n)
				}
				return r
			}

			function i(e) {
				for(var t = 1; t < arguments.length; t++) {
					var r = null != arguments[t] ? arguments[t] : {};
					t % 2 ? o(Object(r), !0).forEach(function(t) {
						var n, s, a;
						n = e, s = t, a = r[t], (s = function(e) {
							var t = function(e, t) {
								if("object" != typeof e || !e) return e;
								var r = e[Symbol.toPrimitive];
								if(void 0 !== r) {
									var n = r.call(e, t || "default");
									if("object" != typeof n) return n;
									throw TypeError("@@toPrimitive must return a primitive value.")
								}
								return("string" === t ? String : Number)(e)
							}(e, "string");
							return "symbol" == typeof t ? t : t + ""
						}(s)) in n ? Object.defineProperty(n, s, {
							value: a,
							enumerable: !0,
							configurable: !0,
							writable: !0
						}) : n[s] = a
					}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(r)) : o(Object(r)).forEach(function(t) {
						Object.defineProperty(e, t, Object.getOwnPropertyDescriptor(r, t))
					})
				}
				return e
			}

			function u(e) {
				return t => n.createElement(d, c({
					attr: i({}, e.attr)
				}, t), function e(t) {
					return t && t.map((t, r) => n.createElement(t.tag, i({
						key: r
					}, t.attr), e(t.child)))
				}(e.child))
			}

			function d(e) {
				var t = t => {
					var r, {
							attr: s,
							size: a,
							title: o
						} = e,
						u = function(e, t) {
							if(null == e) return {};
							var r, n, s = function(e, t) {
								if(null == e) return {};
								var r = {};
								for(var n in e)
									if(Object.prototype.hasOwnProperty.call(e, n)) {
										if(t.indexOf(n) >= 0) continue;
										r[n] = e[n]
									}
								return r
							}(e, t);
							if(Object.getOwnPropertySymbols) {
								var a = Object.getOwnPropertySymbols(e);
								for(n = 0; n < a.length; n++) r = a[n], !(t.indexOf(r) >= 0) && Object.prototype.propertyIsEnumerable.call(e, r) && (s[r] = e[r])
							}
							return s
						}(e, l),
						d = a || t.size || "1em";
					return t.className && (r = t.className),
					e.className && (r = (r ? r + " " : "") + e.className),
					n.createElement("svg", c({
						stroke: "currentColor",
						fill: "currentColor",
						strokeWidth: "0"
					}, t.attr, s, u, {
						className: r,
						style: i(i({
							color: e.color || t.color
						}, t.style), e.style),
						height: d,
						width: d,
						xmlns: "http://www.w3.org/2000/svg"
					}), o && n.createElement("title", null, o), e.children)
				};
				return void 0 !== a ? n.createElement(a.Consumer, null, e => t(e)) : t(s)
			}
		},
		3881: (e, t, r) => {
			Promise.resolve().then(r.bind(r, 6438))
		},
		6046: (e, t, r) => {
			"use strict";
			var n = r(6658);r.o(n, "useRouter") && r.d(t, {
				useRouter: function() {
					return n.useRouter
				}
			})
		},
		6438: (e, t, r) => {
			"use strict";r.r(t),
			r.d(t, {
				default: () => d
			});
			var n = r(5155),
				s = r(2115),
				a = r(6046),
				l = r(1169),
				c = r(6280),
				o = r(8173),
				i = r.n(o),
				u = r(2492);
			let d = () => {
				let [e, t] = (0, s.useState)(["", "", "", "", "", ""]),
				[r, o] = (0, s.useState)(null),
				d = (0, s.useRef)([]),
				m = (0, a.useRouter)();
				(0, s.useEffect)(() => {
					let e = localStorage.getItem("firstName"),
						t = localStorage.getItem("lastName");o((0, u.w)(e, t))
				}, []);
				let f = (r, n) => {
						let s = n.target.value;
						if(!/^\d*$/.test(s)) return;
						let a = [...e];
						if(a[r] = s, t(a), s && r < 5) {
							var l;
							null === (l = d.current[r + 1]) || void 0 === l || l.focus()
						}
					},
					h = (t, r) => {
						if("Backspace" === r.key && !e[t] && t > 0) {
							var n;
							null === (n = d.current[t - 1]) || void 0 === n || n.focus()
						}
					},
					b = e.every(e => "" !== e);
				return null === r ? null : r ? (0, n.jsxs)("div", {
					className: "min-h-screen bg-[#c9dfd3] flex flex-col",
					children: [(0, n.jsxs)("div", {
						className: "flex justify-between items-center p-4 bg-white shadow-md font-medium",
						children: [(0, n.jsxs)("button", {
							className: "flex items-center text-black cursor-pointer",
							children: [(0, n.jsx)(l.prl, {
								className: "mr-2 text-xl",
								size: 24
							}), "Help"]
						}), (0, n.jsxs)("button", {
							className: "flex items-center text-black cursor-pointer",
							onClick: () => m.push("/"),
							children: ["Return to Home", (0, n.jsx)(c.M14, {
								className: "ml-2 text-xl",
								size: 24
							})]
						})]
					}), (0, n.jsxs)("div", {
						className: "flex flex-col items-center justify-center flex-grow p-6 text-lg",
						children: [(0, n.jsx)("h1", {
							className: "text-3xl mb-2",
							children: "Start Code"
						}), (0, n.jsx)("p", {
							className: "text-black",
							children: "Once the proctor shares the start code, enter it here to begin testing."
						}), (0, n.jsxs)("p", {
							className: "mt-2",
							children: ["The start code contains", " ", (0, n.jsx)("span", {
								className: "text-black font-bold",
								children: "numbers only"
							}), "."]
						}), (0, n.jsx)("div", {
							className: "flex gap-3 my-5",
							children: e.map((e, t) => (0, n.jsx)("input", {
								ref: e => d.current[t] = e,
								type: "text",
								maxLength: "1",
								value: e,
								onChange: e => f(t, e),
								onKeyDown: e => h(t, e),
								className: "w-16 h-16 text-center text-2xl bg-white border-2 font-semibold border-black/50 rounded-lg focus:border-gray-400 focus:outline-none"
							}, t))
						}), (0, n.jsx)("button", {
							onClick: () => {
								b && m.push("/test")
							},
							className: "px-6 py-3 text-sm rounded-3xl border-2 border-black/70 hover:underline  ".concat(b ? "bg-yellow-400 text-black cursor-pointer hover:bg-yellow-500/80" : "bg-[#f0f0f0] text-[#c0c0c0] cursor-not-allowed"),
							disabled: !b,
							children: "Start Test"
						})]
					}), (0, n.jsx)("div", {
						className: "p-4 text-center shadow-md",
						children: (0, n.jsxs)("p", {
							children: ["You can", " ", (0, n.jsx)(i(), {
								href: "/",
								className: "underline text-[#0000ff]",
								children: "review the instructions"
							}), " ", "that the proctor reads aloud."]
						})
					})]
				}) : (0, n.jsx)("div", {
					className: "min-h-screen flex items-center justify-center bg-red-50 p-4",
					children: (0, n.jsxs)("div", {
						className: "bg-white p-6 rounded-lg shadow-md text-center max-w-sm",
						children: [(0, n.jsx)("h2", {
							className: "text-xl font-bold text-red-600 mb-2",
							children: "Access Denied"
						}), (0, n.jsx)("p", {
							className: "text-gray-700",
							children: "You are not permitted to access this page."
						}), (0, n.jsx)(i(), {
							href: "/",
							className: "mt-4 inline-block text-blue-600 underline font-medium",
							children: "Return to Main Page"
						})]
					})
				})
			}
		}
	},
	e => {
		var t = t => e(e.s = t);e.O(0, [512, 380, 441, 587, 358], () => t(3881)),
		_N_E = e.O()
	}
]);
