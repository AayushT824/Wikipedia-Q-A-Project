import wikipedia
import nltk
from nltk import WordNetLemmatizer
from transformers import pipeline
import torch
import warnings
warnings.catch_warnings()
warnings.simplefilter("ignore")

class query:
    question = ""  # question asked by user
    question_words = []  # list of nouns in query
    key_titles = []  # Will contain all the relevant article titles after initial search
    page_list = dict()  # will contain the content of each page with titles as keys
    top_article = []  # contains top relevant article
    top_paragraphs = []  # contains top 10 relevant paragraphs in top article
    top_sentence = ""  # represents top matching sentence/word in article
    lem = WordNetLemmatizer()  # lemmatizes words in article to link similar words

    # Constructor that automatically processes query once object is instantiated
    def __init__(self, user_query):
        self.question = user_query
        self.identify_articles()
        self.tokenization()
        self.top_articles()
        self.top_sentence()

    # Identify list of articles relevant to user query
    def identify_articles(self):
        self.question_words = [self.lem.lemmatize(word) for word in nltk.word_tokenize(self.question)
                               if (word not in nltk.corpus.stopwords.words("english"))]  # List of words in user query
        for phrase in self.question_words:  # eliminates all nonessential words from query for analysis
            if phrase in nltk.corpus.stopwords.words("english"):
                self.question_words.remove(phrase)

        for key_word in self.question_words:  # loops through all essential words in question and records titles found
            if nltk.pos_tag([key_word])[0][1][0] == 'N':  # checks if word is a noun
                self.key_titles += wikipedia.search(key_word)
        self.key_titles.append(wikipedia.search(self.question))  # searches entire query in wikipedia and appends titles
        return self.key_titles  # returns list of relevant article titles

    # Will tokenize each article in list of key article names into individual words
    def tokenization(self):
        # Cycles through all key titles and creates dictionary entry for each
        # Maps article titles to list of content words
        for n in range(len(self.key_titles)):
            name = self.key_titles[n]
            try:  # if page error is not thrown, checks if disambiguation error is thrown - then chooses first option
                try:  # only tokenizes page if page error is not thrown while getting page
                    page = wikipedia.page(name)
                except wikipedia.PageError:
                    continue
            except wikipedia.DisambiguationError as error:
                page = wikipedia.page(error.options[0])

            # If page contains all nouns and is not already a dictionary key, continue
            if page.title not in self.page_list.keys() and self.nouns_in_string(page.content):
                # Splits by paragraph, then word tokenizes each paragraph to avoid NLTK tokenization bug that does not
                # split by new lines
                paragraphs = page.content.split("\n")
                content = []  # represents all content in article
                for paragraph in paragraphs:
                    content += nltk.word_tokenize(paragraph)
                self.page_list[page.title] = content  # creates dictionary entry mapping article name to list of words

    # Will check if the given string contains all of this query's nouns
    # Typically string will represent article content
    def nouns_in_string(self, string):
        for noun in self.question_words:
            if noun not in string and nltk.pos_tag([noun])[0][1][0] == "N":  # checks if word is a noun
                return False
        return True

    # will narrow down article selection to top relevant article
    def top_articles(self):
        ranking_values = dict()  # maps article titles to ranking values
        for article in self.page_list.keys():  # iterates through every article chosen thus far
            rank = 0
            for noun in self.question_words:
                freq = self.page_list[article].count(noun)  # counts occurrences of this query noun in article
                if nltk.pos_tag([noun])[0][1] == "NNP":  # checks if noun is proper
                    freq *= 2  # double weights proper nouns when calculating rank (more important)
                rank += freq
            ranking_values[article] = rank  # maps each article to a ranking value

        rankings = self.ranked(ranking_values)  # list of articles ordered by ranking value
        self.top_article = rankings[0]  # top article in list

    # returns the most relevant sentence to the query
    def top_sentence(self):
        paragraph_to_words = dict()  # maps paragraphs in top article to list of their words
        all_content = wikipedia.page(self.top_article).content.split("\n")

        for paragraph in all_content:  # creates dictionary mapping articles to lists of their lemmatized content words
            paragraph_to_words[paragraph] = [self.lem.lemmatize(x) for x in nltk.word_tokenize(paragraph)]

        ranking_values = dict()  # will map paragraphs to a ranking value to determine relevancy to query
        for paragraph in paragraph_to_words.keys():
            total = 0
            words = []
            for word in self.question_words:
                # Will count total appearances of any query nouns in paragraph, divided by 10,000
                total += paragraph_to_words[paragraph].count(word) * .0001

                # Will append word to list of words for this paragraph if the paragraph contains at least one occurrence
                # of this word
                if paragraph_to_words[paragraph].count(word) > 0:
                    words.append(word)

            # Adds total number of unique query nouns in paragraph to total, thus prioritizing number of unique
            # nouns when ranking paragraphs, using total query noun appearances to break ties
            total += len(words)
            ranking_values[paragraph] = total

        rankings = self.ranked(ranking_values)
        self.top_paragraphs = rankings[0] + rankings[1] + rankings[2]  # selects top 3 ranked paragraphs

        # Creates q-a pipeline, giving it the user query as the question and the top 3 paragraphs as context
        question_answerer = pipeline("question-answering", model="distilbert-base-cased-distilled-squad")
        self.top_sentence = question_answerer({
            'question': self.question,
            'context': self.top_paragraphs})["answer"]

    # returns sorted list of dictionary keys based on item mapped to by key
    @staticmethod
    def ranked(ranking_values):
        # local function to return an item's ranking value
        def rank_key(article):
            return ranking_values[article]

        rankings = list(ranking_values.keys())
        return sorted(rankings, key=rank_key, reverse=True)  # sort by rank value stored in dictionary ranking_values


if __name__ == '__main__':
    print("Enter question below: ")
    question = input()
    try:
        query = query(question)
    except wikipedia.exceptions.WikipediaException:
        print("Error handling query, please try another question")
        exit()
    print(query.top_sentence)
