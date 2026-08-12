"""Banco de frases de acompañamiento de BRÚJULA.

Las frases marcadas como base vienen de Elizabeth; el resto sigue esa misma voz:
cercana, en segunda persona, sin promesas de resultados ni presión culposa.

Para agregar más, basta con añadirlas a la lista que corresponda: la aplicación
elige sola y no hay que tocar ninguna otra parte del código.
"""

# 1. Recordatorios de acción: hay algo pendiente hoy.
RECORDATORIOS = [
    ("Tu siguiente paso te está esperando 🧭",
     "Tienes una actividad pendiente. Dedicar unos minutos hoy puede acercarte mucho más a tu meta."),
    ("No dejes para mañana lo que puede acercarte a tu objetivo hoy",
     "Tienes una llamada de seguimiento pendiente. ¿La hacemos hoy?"),
    ("La constancia convierte las metas en resultados",
     "Hoy tienes una actividad programada. ¡Vamos por ella!"),
    ("Tu meta no se alcanza de un solo salto… se alcanza avanzando todos los días",
     "Recuerda hacer tus llamadas de seguimiento de hoy."),
    ("Lo que agendaste ayer, hoy te toca vivirlo",
     "Tienes actividades esperándote. Empieza por la que menos ganas te da: lo demás fluye solo."),
    ("Un paso pequeño sigue siendo un paso",
     "No tiene que ser tu mejor día. Basta con que sea un día en que avanzaste."),
    ("Tu agenda es tu promesa contigo",
     "Hoy tienes actividades pendientes. Cumplirte a ti misma también cuenta como logro."),
    ("El seguimiento es donde se construye la confianza",
     "Alguien está esperando tu mensaje. Ese detalle es el que hace la diferencia."),
    ("Media hora enfocada rinde más que un día disperso",
     "Elige una actividad de tu agenda y dale toda tu atención."),
    ("Las oportunidades no se pierden: se enfrían",
     "Tienes seguimientos pendientes. Retómalos mientras la conversación sigue fresca."),
    ("Hoy es un buen día para cerrar pendientes",
     "Revisa tu agenda: te sorprenderá lo rápido que se completa cuando empiezas."),
    ("Avanzar no siempre se siente épico",
     "A veces avanzar es solo hacer la llamada que traes pendiente. Hazla y sigue."),
]

# 2. Motivación específica para las llamadas del día.
LLAMADAS = [
    "Una conversación puede abrir una nueva oportunidad.",
    "No sabes qué puede pasar hasta que haces la llamada.",
    "Hoy puede ser el día en que alguien diga: ¡sí!",
    "Prepárate, conecta y escucha. Lo demás puede suceder.",
    "La llamada que estás postergando puede ser la que estabas esperando.",
    "No llamas a vender: llamas a entender qué necesita la otra persona.",
    "El teléfono pesa menos cuando recuerdas para qué lo estás levantando.",
    "Cada llamada te deja algo: una cita, un aprendizaje o una relación más cercana.",
    "Nadie contesta el mensaje que nunca enviaste.",
    "Habla con calma y escucha con ganas. Eso ya te distingue.",
    "Si te dicen que no, hoy aprendiste algo. Si te dicen que sí, hoy creciste.",
    "Empieza por la persona con la que te sientes cómoda: eso rompe el hielo del día.",
    "No necesitas el discurso perfecto. Necesitas interés genuino.",
    "Tu voz transmite más que cualquier mensaje escrito.",
]

# 3. Motivación general, para cualquier momento.
GENERALES = [
    "Recuerda por qué comenzaste.",
    "No compares tu capítulo 1 con el capítulo 20 de alguien más.",
    "No necesitas hacerlo perfecto. Necesitas hacerlo constante.",
    "Cada contacto, cada aprendizaje y cada seguimiento construyen tu negocio.",
    "Tu meta merece que no te rindas.",
    "Hoy tienes una nueva oportunidad para acercarte a donde quieres estar.",
    "Los resultados de mañana se construyen con las acciones de hoy.",
    "Sigue caminando. Tu meta está adelante.",
    "El progreso silencioso también es progreso.",
    "Nadie empieza sabiendo. Todos empiezan intentando.",
    "Tu ritmo es tuyo. Lo importante es no detenerte.",
    "Las semanas flojas también forman parte del camino.",
    "Lo que hoy te cuesta trabajo, en unos meses lo harás sin pensarlo.",
    "Construir un negocio se parece más a caminar que a correr.",
    "Cuida tu energía: es tu herramienta principal.",
    "Celebra los avances pequeños. Son los que sostienen los grandes.",
    "Tu historia le sirve a alguien que apenas va empezando.",
    "Confía en el proceso, pero acompáñalo con acción.",
    "El día que menos ganas tienes es el que más suma a tu constancia.",
    "No estás atrasada. Estás en tu propio tiempo.",
    "Hazlo con calma, pero hazlo.",
    "Tu disciplina de hoy es la libertad de mañana.",
]

# 4. Frases según el perfil dominante de la brújula.
PERFILES = {
    "Ejecutor": [
        "Recuerda que tu fortaleza es la ACCIÓN, ya sabes qué hacer ¡Hazlo ya!",
        "No necesitas más plan: necesitas empezar. Eso se te da bien.",
        "Tu ventaja es que no te congelas. Aprovéchala hoy.",
        "Haz primero lo que otros siguen pensando.",
        "Prueba, ajusta y vuelve a intentar: así avanzas tú.",
        "Tu energía contagia. Úsala en las primeras horas del día.",
        "No esperes a sentirte lista. Empieza y el ánimo llega.",
        "Convierte esa idea que traes en una acción con fecha.",
        "Tu impulso es tu talento. Dale dirección y será imparable.",
        "Menos vueltas, más movimiento. Ese es tu estilo.",
    ],
    "Conexión": [
        "Tu fortaleza está en las personas y hoy puede ser un buen día para iniciar una conversación.",
        "Escuchar bien es tu superpoder. Úsalo hoy.",
        "La gente confía en ti. Eso ya es medio camino.",
        "Pregunta más de lo que explicas: ahí está tu ventaja.",
        "Una conversación sincera vale más que diez mensajes.",
        "Acuérdate de esa persona que hace tiempo no saludas.",
        "Tu calidez abre puertas que ningún argumento abre.",
        "Conecta primero, propón después.",
        "Hoy alguien necesita que le preguntes cómo está.",
        "Tu red crece cuando te interesas de verdad.",
    ],
    "Constancia": [
        "Tu fortaleza está en la Constancia… ¡no te detengas!",
        "Tu ventaja no es la velocidad: es que no te bajas del camino.",
        "Sigue tu rutina aunque hoy no se vea el resultado.",
        "Los procesos que sostienes son los que sostienen tu negocio.",
        "Revisa tu plan, marca lo hecho y continúa. Así ganas tú.",
        "La disciplina que ya tienes es lo que otros están buscando.",
        "Un día ordenado vale por tres improvisados.",
        "Tu seguimiento puntual es tu mejor carta de presentación.",
        "Avanza hoy lo que te toca hoy. Mañana agradecerás no arrastrarlo.",
        "Tu constancia es callada, pero se nota en los resultados.",
    ],
    "Analista": [
        "Aprender es tu fortaleza, háblale a alguien de lo que has aprendido para que lo animes a dar el siguiente paso.",
        "Tu claridad tranquiliza a quien tiene dudas.",
        "Comparte un dato útil hoy: eso genera confianza.",
        "Sabes explicar sin presionar. Esa es tu ventaja.",
        "Estudia un poco, pero no te quedes solo estudiando: compártelo.",
        "Tu respuesta bien fundamentada resuelve más que mil insistencias.",
        "Convierte lo que sabes en algo que la otra persona pueda usar hoy.",
        "La gente busca certezas. Tú las das con calma.",
        "Un buen argumento tuyo vale por varias llamadas apresuradas.",
        "Prepárate lo justo y lánzate: la práctica también enseña.",
    ],
    "Liderazgo": [
        "Tu crecimiento inspira a otros… sigue avanzando y será la mejor motivación.",
        "Alguien está observando tu ejemplo hoy.",
        "Enseñar lo que sabes multiplica lo que construyes.",
        "Pregunta a tu equipo cómo va: ahí empieza tu liderazgo.",
        "Tu visión le da rumbo a quienes te acompañan.",
        "Reconoce el avance de alguien más. Eso también hace crecer tu negocio.",
        "Cuando tú avanzas, tu equipo se anima a avanzar.",
        "Acompaña a una persona hoy: será tu mejor inversión.",
        "El liderazgo no es ir adelante, es no soltar a quien viene atrás.",
        "Tu ejemplo enseña más que cualquier capacitación.",
    ],
}

# 5. Cierre del día: lo que se hizo.
CIERRES = [
    "Cierra el día sabiendo que avanzaste.",
    "Lo que hiciste hoy ya está construido. Descansa.",
    "Un día menos de distancia hacia tu meta.",
    "Anota tu avance y suelta el resto: mañana seguimos.",
    "Hoy sumaste. Eso es lo que cuenta.",
    "Revisa lo que lograste antes de cerrar. Te va a gustar verlo.",
    "Tu constancia se mide en días como este.",
    "Descansar también es parte de sostener el ritmo.",
    "Guarda tus avances del día: tu yo de mañana lo agradecerá.",
    "Terminaste el día. Eso ya es un logro.",
]

CIERRES_SIN_ACTIVIDAD = [
    "Hoy no quedó registrado ningún avance, y está bien.",
    "Los días de pausa también forman parte del camino.",
    "Mañana es una página nueva. Empieza por una sola acción.",
]


def total_frases() -> int:
    return (len(RECORDATORIOS) + len(LLAMADAS) + len(GENERALES) + len(CIERRES)
            + len(CIERRES_SIN_ACTIVIDAD) + sum(len(v) for v in PERFILES.values()))
