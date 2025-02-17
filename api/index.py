from flask import Flask, render_template, request, jsonify, send_from_directory
from openai import OpenAI
from dotenv import load_dotenv
import os
import json
import requests

load_dotenv()

app = Flask(__name__, static_folder='../static', template_folder='../templates')
openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
sonar_api_key = os.getenv('SONAR_API_KEY')
sonar_api_url = "https://api.perplexity.ai/chat/completions"

# Global variable to store user's comfort level
user_comfort_level = 3  # Default to intermediate

def query_sonar(context, question):
    """Query the Sonar API for enhanced paper understanding"""
    try:
        headers = {
            "Authorization": f"Bearer {sonar_api_key}",
            "Content-Type": "application/json"
        }
        
        messages = [
            {
                "role": "system",
                "content": f"""You are an AI research paper assistant. Analyze the following paper excerpt and answer the question.
                Comfort Level: {user_comfort_level}/5
                If comfort level is 1-2: Keep explanations basic and focus on fundamental concepts.
                If comfort level is 3: Provide balanced explanations with some technical details.
                If comfort level is 4-5: You can use advanced terminology and complex details.
                
                Paper excerpt: {context}"""
            },
            {
                "role": "user",
                "content": question
            }
        ]
        
        payload = {
            "model": "sonar",
            "messages": messages,
            "temperature": 0.2,
            "top_p": 0.9,
            "stream": False
        }
        
        response = requests.post(sonar_api_url, headers=headers, json=payload)
        response.raise_for_status()
        
        sonar_response = response.json()
        
        return {
            "answer": sonar_response["choices"][0]["message"]["content"],
            "citations": sonar_response.get("citations", []),
            "usage": sonar_response.get("usage", {})
        }
    except requests.exceptions.RequestException as e:
        print(f"Sonar API error: {str(e)}")
        if hasattr(e, 'response') and hasattr(e.response, 'text'):
            print(f"Response text: {e.response.text}")
        return {
            "answer": "Sorry, I encountered an error while analyzing the paper.",
            "citations": [],
            "usage": {}
        }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/set_comfort_level', methods=['POST'])
def set_comfort_level():
    global user_comfort_level
    data = request.json
    user_comfort_level = data.get('comfort_level', 3)
    return jsonify({"status": "success"})

@app.route('/analyze', methods=['POST'])
def analyze():
    global user_comfort_level
    data = request.json
    context = data.get('context', '')
    question = data.get('question', '')
    is_comprehension = data.get('is_comprehension', False)

    try:
        # Get response from Sonar
        sonar_response = query_sonar(context, question)
        
        # Format the response
        response_data = {
            "answer": sonar_response["answer"],
            "citations": sonar_response["citations"],
            "usage": sonar_response["usage"]
        }
        
        return jsonify(response_data)
        
    except Exception as e:
        error_msg = f"Error in /analyze: {str(e)}"
        print(error_msg)
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": error_msg}), 500
