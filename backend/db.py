import os
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


def serialize(doc):
    """Convert a MongoDB document into a JSON-safe dict (ObjectId -> id str)."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    return doc


def oid(value: str) -> ObjectId:
    return ObjectId(value)
