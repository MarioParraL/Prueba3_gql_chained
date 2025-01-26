import { Collection } from "mongodb";
import { APIPhone, APITime, ContactModel } from "./types.ts";
import { ObjectId } from "mongodb";
import { GraphQLError } from "graphql";

type Context = {
  ContactsCollection: Collection<ContactModel>;
};

type QueryGetContactsArgs = {
  id: string;
};

type MutationAddContactArgs = {
  name: string;
  phone: string;
};

type MutationUpdateContactArgs = {
  id: string;
  name?: string;
  phone?: string;
};

type MutationDeleteContactsArgs = {
  id: string;
};

export const resolvers = {
  Query: {
    getContacts: async (
      _: unknown,
      __: unknown,
      ctx: Context,
    ): Promise<ContactModel[]> => {
      const contacts = await ctx.ContactsCollection.find().toArray();
      return contacts;
    },

    getContact: async (
      _: unknown,
      args: QueryGetContactsArgs,
      ctx: Context,
    ): Promise<ContactModel | null> => {
      return await ctx.ContactsCollection.findOne({
        _id: new ObjectId(args.id),
      });
    },
  },

  Mutation: {
    deleteContact: async (
      _: unknown,
      args: MutationDeleteContactsArgs,
      ctx: Context,
    ): Promise<boolean> => {
      const { deletedCount } = await ctx.ContactsCollection.deleteOne({
        _id: new ObjectId(args.id),
      });
      return deletedCount === 1;
    },

    addContact: async (
      _: unknown,
      args: MutationAddContactArgs,
      ctx: Context,
    ): Promise<ContactModel> => {
      const API_KEY = Deno.env.get("API_KEY");
      if (!API_KEY) throw new GraphQLError("Need an API NINJAS API_KEY");

      const { name, phone } = args;
      const phoneExist = await ctx.ContactsCollection.findOne({ phone });
      if (phoneExist) throw new GraphQLError("Phone already exist");

      const url = `https://api.api-ninjas.com/v1/validatephone?number=${phone}`;
      const data = await fetch(url, {
        headers: {
          "X-Api-Key": API_KEY,
        },
      });

      if (data.status !== 200) throw new GraphQLError("Api Ninja Error");
      const response: APIPhone = await data.json();

      if (!response.is_valid) throw new GraphQLError("Invalid Phone");
      const country = response.country;
      const timezone = response.timezones[0];

      const { insertedId } = await ctx.ContactsCollection.insertOne({
        name,
        phone,
        country,
        timezone,
      });

      return {
        _id: insertedId,
        name,
        phone,
        country,
        timezone,
      };
    },

    updateContact: async (
      _: unknown,
      args: MutationUpdateContactArgs,
      ctx: Context,
    ): Promise<ContactModel> => {
      const API_KEY = Deno.env.get("API_KEY");
      if (!API_KEY) throw new GraphQLError("Need an API NINJAS API_KEY");

      const { id, name, phone } = args;
      if (!name && !phone) {
        throw new GraphQLError("At leats you have to update one");
      }

      if (!phone) {
        const newUser = await ctx.ContactsCollection.findOneAndUpdate({
          _id: new ObjectId(id),
        }, {
          $set: { name },
        });
        if (!newUser) throw new GraphQLError("User not found");
        return newUser;
      }
      const phoneExists = await ctx.ContactsCollection.findOne({ phone });
      if (phoneExists && phoneExists._id.toString() !== id) {
        throw new GraphQLError("Phone already taken by Diego");
      }

      if (phoneExists) {
        const newUser = await ctx.ContactsCollection.findOneAndUpdate({
          _id: new ObjectId(id),
        }, {
          $set: { name: name || phoneExists.name },
        });
        if (!newUser) throw new GraphQLError("User not found!");
        return newUser;
      }
      // phone has changed
      const url = `https://api.api-ninjas.com/v1/validatephone?number=${phone}`;
      const data = await fetch(url, {
        headers: {
          "X-Api-Key": API_KEY,
        },
      });
      if (data.status !== 200) throw new GraphQLError("API Ninja Error");

      const response: APIPhone = await data.json();

      if (!response.is_valid) throw new GraphQLError("Not valid phone format");

      const country = response.country;
      const timezone = response.timezones[0];

      const newUser = await ctx.ContactsCollection.findOneAndUpdate({
        _id: new ObjectId(id),
      }, {
        name,
        phone,
        country,
        timezone,
      });
      return newUser;
    },
  },

  Contact: {
    id: (parent: ContactModel) => {
      return parent._id!.toString();
    },
    time: async (parent: ContactModel): Promise<string> => {
      const API_KEY = Deno.env.get("API_KEY");
      if (!API_KEY) throw new GraphQLError("Need an API NINJAS API_KEY");

      const timezone = parent.timezone;

      const url =
        `https://api.api-ninjas.com/v1/worldtime?timezone=${timezone}`;
      const data = await fetch(url, {
        headers: {
          "X-Api-Key": API_KEY,
        },
      });

      if (data.status !== 200) throw new GraphQLError("Api Ninja Error");
      const response: APITime = await data.json();
      return response.datetime;
    },
  },
};
